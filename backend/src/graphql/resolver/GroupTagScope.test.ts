import { RoleNames } from '@enum/RoleNames'
import { cleanDB, resetToken, testEnvironment } from '@test/helpers'
import { ApolloServerTestClient } from 'apollo-server-testing'
import { AppDatabase, Contribution as DbContribution, User, UserRole } from 'database'
import { getLogger as originalGetLogger } from 'log4js'
import { In } from 'typeorm'
import { userFactory } from '@/seeds/factory/user'
import { createContribution, denyContribution, login } from '@/seeds/graphql/mutations'
import { adminListContributionMessages, adminListContributions } from '@/seeds/graphql/queries'
import { bibiBloxberg } from '@/seeds/users/bibi-bloxberg'
import { peterLustig } from '@/seeds/users/peter-lustig'
import { parseModeratorScope } from './util/findContributions'

// Group functions ("Weg A"): the core security check — a scoped moderator must only see
// the contributions of the group tags they are authorised for. Tested through the
// backward-compatible inline-"#tag" path, so it needs no structured-tag seeding.

jest.mock('core', () => {
  const originalModule = jest.requireActual('core')
  return {
    __esModule: true,
    ...originalModule,
    sendContributionConfirmedEmail: jest.fn(),
    sendContributionDeniedEmail: jest.fn(),
    sendContributionDeletedEmail: jest.fn(),
    sendEmailTranslated: jest.fn(),
  }
})
jest.mock('@/password/EncryptorUtils')

let mutate: ApolloServerTestClient['mutate']
let query: ApolloServerTestClient['query']
let db: AppDatabase
let testEnv: {
  mutate: ApolloServerTestClient['mutate']
  query: ApolloServerTestClient['query']
  db: AppDatabase
}

const FIREFIGHTER = '#firefighter group-scope test fire brigade'
const MUSIC = '#music group-scope test choir'
const UNTAGGED = 'group-scope test contribution without any tag'
const UMLAUT = '#Grünwald-Süd group-scope test Straßenfest'

beforeAll(async () => {
  testEnv = await testEnvironment(originalGetLogger('apollo'))
  mutate = testEnv.mutate
  query = testEnv.query
  db = testEnv.db
  await cleanDB()
})

afterAll(async () => {
  await cleanDB()
  await db.destroy()
})

const loginAs = async (email: string): Promise<void> => {
  resetToken()
  await mutate({ mutation: login, variables: { email, password: 'Aa12345_' } })
}

const listMemos = async (): Promise<string[]> => {
  const {
    data: {
      adminListContributions: { contributionList },
    },
  } = await query({
    query: adminListContributions,
    variables: { paginated: { pageSize: 100 } },
  })
  return contributionList.map((contribution: { memo: string }) => contribution.memo)
}

// The same list, filtered to the contributions that belong to no group at all.
const listUntaggedMemos = async (): Promise<string[]> => {
  const {
    data: {
      adminListContributions: { contributionList },
    },
  } = await query({
    query: adminListContributions,
    variables: { paginated: { pageSize: 100 }, filter: { groupTag: '*untagged' } },
  })
  return contributionList.map((contribution: { memo: string }) => contribution.memo)
}

const contributionIdByMemo = async (memo: string): Promise<number> => {
  const contribution = await DbContribution.findOneOrFail({ where: { memo } })
  return contribution.id
}

describe('adminListContributions — moderator visibility scope', () => {
  let moderator: User

  beforeAll(async () => {
    await userFactory(testEnv, peterLustig) // administrator
    moderator = await userFactory(testEnv, bibiBloxberg) // becomes the scoped moderator

    // The (soon-to-be moderator) submits one contribution per group plus one untagged.
    await loginAs('bibi@bloxberg.de')
    for (const memo of [FIREFIGHTER, MUSIC, UNTAGGED]) {
      await mutate({
        mutation: createContribution,
        variables: { amount: '100', memo, contributionDate: new Date().toString() },
      })
    }
    resetToken()

    // This suite deliberately exercises the backward-compatible inline-"#tag" path, so the
    // contributions have to look like the stock that predates the group field: submitting
    // through the group field stamps group_tags_set_at, and a stamped contribution ignores
    // hashtags in its memo. Clearing the stamp reproduces the older rows.
    await DbContribution.update(
      { memo: In([FIREFIGHTER, MUSIC, UNTAGGED]) },
      { groupTagsSetAt: null },
    )

    // Promote the user to MODERATOR, scoped to the "firefighter" group only.
    const role = UserRole.create()
    role.createdAt = new Date()
    role.userId = moderator.id
    role.role = RoleNames.MODERATOR
    role.visibleGroupTags = JSON.stringify(['firefighter'])
    await role.save()
  })

  afterAll(() => {
    resetToken()
  })

  it('shows a scoped moderator only the contributions of their group', async () => {
    await loginAs('bibi@bloxberg.de')
    const memos = await listMemos()
    expect(memos).toContain(FIREFIGHTER)
    expect(memos).not.toContain(MUSIC)
    expect(memos).not.toContain(UNTAGGED)
  })

  it('shows an administrator every contribution regardless of tags', async () => {
    await loginAs('peter@lustig.de')
    const memos = await listMemos()
    expect(memos).toEqual(expect.arrayContaining([FIREFIGHTER, MUSIC, UNTAGGED]))
  })

  it('binds a KI-Moderator (MODERATOR_AI) to the very same scope', async () => {
    // ROLE_MODERATOR_AI = MODERATOR_RIGHTS + Crea, i.e. a moderator who may additionally use
    // the AI assistant — not a wider role. The visibility scope must bind them exactly like a
    // plain MODERATOR, otherwise a KI-Moderator would silently see every group.
    const role = await UserRole.findOneOrFail({ where: { userId: moderator.id } })
    role.role = RoleNames.MODERATOR_AI
    await role.save()

    await loginAs('bibi@bloxberg.de')
    const memos = await listMemos()
    expect(memos).toContain(FIREFIGHTER)
    expect(memos).not.toContain(MUSIC)
    expect(memos).not.toContain(UNTAGGED)
  })

  // The scope is a real access boundary, not only a list filter: acting on a single
  // contribution by id must be refused just the same. Past work stays in the record —
  // this only gates what is attempted now.
  it('refuses to read the messages of a contribution outside the scope', async () => {
    const musicId = await contributionIdByMemo(MUSIC)
    await loginAs('bibi@bloxberg.de')
    const { errors } = await query({
      query: adminListContributionMessages,
      variables: { contributionId: musicId },
    })
    expect(errors?.[0]?.message).toContain('outside the moderator group scope')
  })

  it('allows reading the messages of a contribution inside the scope', async () => {
    const firefighterId = await contributionIdByMemo(FIREFIGHTER)
    await loginAs('bibi@bloxberg.de')
    const { errors } = await query({
      query: adminListContributionMessages,
      variables: { contributionId: firefighterId },
    })
    expect(errors).toBeUndefined()
  })

  it('refuses a moderation action on a contribution outside the scope', async () => {
    const musicId = await contributionIdByMemo(MUSIC)
    await loginAs('bibi@bloxberg.de')
    const { errors } = await mutate({ mutation: denyContribution, variables: { id: musicId } })
    expect(errors?.[0]?.message).toContain('outside the moderator group scope')
  })

  it('matches umlaut tags end to end and ignores upper/lower case', async () => {
    // The contribution carries an inline "#Grünwald-Süd" — capitals and umlauts …
    await loginAs('bibi@bloxberg.de')
    await mutate({
      mutation: createContribution,
      variables: { amount: '100', memo: UMLAUT, contributionDate: new Date().toString() },
    })
    resetToken()
    // Legacy stock again — see the note in beforeAll.
    await DbContribution.update({ memo: UMLAUT }, { groupTagsSetAt: null })

    // … while the moderator is scoped to the very same tag written all in lower case.
    // The tables are utf8mb4_unicode_ci, so the comparison ignores case and the two match.
    const role = await UserRole.findOneOrFail({ where: { userId: moderator.id } })
    role.visibleGroupTags = JSON.stringify(['grünwald-süd'])
    await role.save()

    await loginAs('bibi@bloxberg.de')
    const memos = await listMemos()
    expect(memos).toContain(UMLAUT)
    expect(memos).not.toContain(FIREFIGHTER)
  })
})

// The "(no group)" filter: a moderator who works through the contributions no group
// moderator is looking after picks it from the same dropdown as a real group. It replaces
// the old "hide #hashtags" switch, which asked whether the memo contained a '#' and
// therefore answered the wrong question once the group lived in its own field.
describe('adminListContributions — the "no group" filter', () => {
  let moderator: User

  beforeAll(async () => {
    await userFactory(testEnv, peterLustig) // administrator
    moderator = await userFactory(testEnv, bibiBloxberg)

    await loginAs('bibi@bloxberg.de')
    for (const memo of [FIREFIGHTER, MUSIC, UNTAGGED]) {
      await mutate({
        mutation: createContribution,
        variables: { amount: '100', memo, contributionDate: new Date().toString() },
      })
    }
    resetToken()
    // Legacy stock, as in the suite above: the inline "#tag" only counts while the group
    // was never set through the field.
    await DbContribution.update(
      { memo: In([FIREFIGHTER, MUSIC, UNTAGGED]) },
      { groupTagsSetAt: null },
    )
  })

  afterAll(() => {
    resetToken()
  })

  it('shows an administrator only the contributions that belong to no group', async () => {
    await loginAs('peter@lustig.de')
    const memos = await listUntaggedMemos()
    expect(memos).toContain(UNTAGGED)
    expect(memos).not.toContain(FIREFIGHTER)
    expect(memos).not.toContain(MUSIC)
  })

  // The filter is a convenience, the scope is an access boundary — picking "(no group)"
  // must not hand a scoped moderator the contributions they are not authorised for.
  //
  // On its own this would also pass if the filter matched nothing at all, so it only means
  // something next to the administrator case above: that one proves the filter really
  // selects UNTAGGED, this one proves the scope still keeps it away. Do not delete one
  // without the other.
  it('does not let a scoped moderator reach past their scope with it', async () => {
    const role = UserRole.create()
    role.createdAt = new Date()
    role.userId = moderator.id
    role.role = RoleNames.MODERATOR
    role.visibleGroupTags = JSON.stringify(['firefighter'])
    await role.save()

    await loginAs('bibi@bloxberg.de')
    const memos = await listUntaggedMemos()
    expect(memos).not.toContain(UNTAGGED)
    expect(memos).not.toContain(MUSIC)
    expect(memos).not.toContain(FIREFIGHTER)
  })

  // A moderator whose scope *is* "no group" gets exactly those — the pairing the filter
  // was asked for.
  it('gives a moderator scoped to "no group" exactly those contributions', async () => {
    const role = await UserRole.findOneOrFail({ where: { userId: moderator.id } })
    role.visibleGroupTags = JSON.stringify(['*untagged'])
    await role.save()

    await loginAs('bibi@bloxberg.de')
    const memos = await listUntaggedMemos()
    expect(memos).toContain(UNTAGGED)
    expect(memos).not.toContain(FIREFIGHTER)
    expect(memos).not.toContain(MUSIC)
  })
})

describe('parseModeratorScope', () => {
  it('returns null for empty or invalid input', () => {
    expect(parseModeratorScope(null)).toBeNull()
    expect(parseModeratorScope('')).toBeNull()
    expect(parseModeratorScope('not json')).toBeNull()
    expect(parseModeratorScope('{"not":"an array"}')).toBeNull()
  })

  it('parses a JSON array of tag strings and drops non-strings', () => {
    expect(parseModeratorScope('["firefighter","*all"]')).toEqual(['firefighter', '*all'])
    expect(parseModeratorScope('["firefighter",5,null,"music"]')).toEqual(['firefighter', 'music'])
    expect(parseModeratorScope('[]')).toEqual([])
  })
})
