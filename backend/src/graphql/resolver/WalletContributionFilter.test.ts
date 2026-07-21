import { cleanDB, resetToken, testEnvironment } from '@test/helpers'
import { ApolloServerTestClient } from 'apollo-server-testing'
import { AppDatabase, User } from 'database'
import { getLogger as originalGetLogger } from 'log4js'
import { Order } from '@/graphql/enum/Order'
import { userFactory } from '@/seeds/factory/user'
import { createContribution, login } from '@/seeds/graphql/mutations'
import { bibiBloxberg } from '@/seeds/users/bibi-bloxberg'
import { loadAllContributions } from './util/contributions'

// Group functions ("Weg A"): the wallet's own contribution search. A member may search by
// text, by the name of the person who submitted, and by group — but NEVER by e-mail
// address. That last one is the point of this file: the admin search does match e-mails,
// and it must not leak into the wallet.

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
let db: AppDatabase
let member: User

const PLAIN = 'wallet filter test about the garden'
const TAGGED = '#walletfiltergroup wallet filter test about the choir'
const PAGINATED = { currentPage: 1, pageSize: 50, order: Order.DESC }

const memosFor = async (filter: {
  query?: string | null
  groupTag?: string | null
}): Promise<string[]> => {
  const [contributions] = await loadAllContributions(PAGINATED, filter)
  return contributions.map((contribution) => contribution.memo)
}

beforeAll(async () => {
  const testEnv = await testEnvironment(originalGetLogger('apollo'))
  mutate = testEnv.mutate
  db = testEnv.db
  await cleanDB()

  member = await userFactory(testEnv, bibiBloxberg)
  resetToken()
  await mutate({ mutation: login, variables: { email: 'bibi@bloxberg.de', password: 'Aa12345_' } })
  for (const memo of [PLAIN, TAGGED]) {
    await mutate({
      mutation: createContribution,
      variables: { amount: '100', memo, contributionDate: new Date().toString() },
    })
  }
  resetToken()
})

afterAll(async () => {
  await cleanDB()
  await db.destroy()
})

describe('wallet contribution search', () => {
  it('finds a contribution by a word from its text', async () => {
    const memos = await memosFor({ query: 'garden' })
    expect(memos).toContain(PLAIN)
    expect(memos).not.toContain(TAGGED)
  })

  it('finds contributions by the name of the person who submitted', async () => {
    const memos = await memosFor({ query: member.firstName })
    expect(memos).toEqual(expect.arrayContaining([PLAIN, TAGGED]))
  })

  it('does NOT find anything by e-mail address', async () => {
    // The decisive one: searching the wallet by e-mail must come up empty, so members
    // cannot look each other up by their address.
    const memos = await memosFor({ query: 'bibi@bloxberg.de' })
    expect(memos).toHaveLength(0)
  })

  it('filters by group, matching the legacy inline tag as well', async () => {
    const memos = await memosFor({ groupTag: 'walletfiltergroup' })
    expect(memos).toContain(TAGGED)
    expect(memos).not.toContain(PLAIN)
  })

  it('returns everything when nothing is filtered', async () => {
    const memos = await memosFor({})
    expect(memos).toEqual(expect.arrayContaining([PLAIN, TAGGED]))
  })
})
