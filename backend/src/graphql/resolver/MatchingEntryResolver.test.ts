import { cleanDB, resetEntity, resetToken, testEnvironment } from '@test/helpers'
import { ApolloServerTestClient } from 'apollo-server-testing'
import { getLogger } from 'config-schema/test/testSetup'
import { AppDatabase, MatchingEntry as DbMatchingEntry, User } from 'database'
import { GraphQLError } from 'graphql'
import { LOG4JS_BASE_CATEGORY_NAME } from '@/config/const'
import { userFactory } from '@/seeds/factory/user'
import {
  createMatchingEntry,
  deleteMatchingEntry,
  login,
  setMatchingEntryActive,
  updateMatchingEntry,
} from '@/seeds/graphql/mutations'
import { listMatchingEntries } from '@/seeds/graphql/queries'
import { bibiBloxberg } from '@/seeds/users/bibi-bloxberg'
import { bobBaumeister } from '@/seeds/users/bob-baumeister'

const logErrorLogger = getLogger(`${LOG4JS_BASE_CATEGORY_NAME}.server.LogError`)

jest.mock('@/password/EncryptorUtils')

// a well-formed uuid that never belongs to a seeded entry
const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000'

let mutate: ApolloServerTestClient['mutate']
let query: ApolloServerTestClient['query']
let db: AppDatabase
let testEnv: {
  mutate: ApolloServerTestClient['mutate']
  query: ApolloServerTestClient['query']
  db: AppDatabase
}

let bibi: User
let bob: User

const loginBibi = async (): Promise<void> => {
  await mutate({
    mutation: login,
    variables: { email: 'bibi@bloxberg.de', password: 'Aa12345_' },
  })
}

const loginBob = async (): Promise<void> => {
  await mutate({
    mutation: login,
    variables: { email: 'bob@baumeister.de', password: 'Aa12345_' },
  })
}

// creates an entry as the currently logged-in user and returns its uuid
const seedEntry = async (input: Record<string, unknown>): Promise<string> => {
  const res: any = await mutate({ mutation: createMatchingEntry, variables: { input } })
  if (res.errors) {
    throw new Error(`seedEntry failed: ${JSON.stringify(res.errors)}`)
  }
  return res.data.createMatchingEntry.uuid
}

beforeAll(async () => {
  testEnv = await testEnvironment()
  mutate = testEnv.mutate
  query = testEnv.query
  db = testEnv.db
  await cleanDB()
  bibi = await userFactory(testEnv, bibiBloxberg)
  bob = await userFactory(testEnv, bobBaumeister)
})

afterAll(async () => {
  await cleanDB()
  await db.destroy()
})

describe('MatchingEntryResolver', () => {
  describe('createMatchingEntry', () => {
    describe('unauthenticated', () => {
      it('returns an error', async () => {
        resetToken()
        const { errors: errorObjects } = await mutate({
          mutation: createMatchingEntry,
          variables: { input: { matchingType: 'offer', summary: 'I offer bike repair' } },
        })
        expect(errorObjects).toEqual([new GraphQLError('401 Unauthorized')])
      })
    })

    describe('authenticated', () => {
      beforeAll(async () => {
        await resetEntity(DbMatchingEntry)
        await loginBibi()
      })

      it('creates an entry and applies the defaults', async () => {
        const res: any = await mutate({
          mutation: createMatchingEntry,
          variables: { input: { matchingType: 'offer', summary: 'I offer bike repair' } },
        })
        expect(res.errors).toBeUndefined()
        expect(res.data.createMatchingEntry).toMatchObject({
          uuid: expect.any(String),
          matchingType: 'offer',
          summary: 'I offer bike repair',
          details: null,
          remote: false,
          active: true,
        })
      })

      it('persists all fields with the correct owner', async () => {
        const res: any = await mutate({
          mutation: createMatchingEntry,
          variables: {
            input: {
              matchingType: 'need',
              summary: 'I need a piano teacher',
              details: 'preferably on weekday evenings',
              remote: true,
            },
          },
        })
        const dbEntry = await DbMatchingEntry.findOneOrFail({
          where: { uuid: res.data.createMatchingEntry.uuid },
        })
        expect(dbEntry).toMatchObject({
          userId: bibi.id,
          matchingType: 'need',
          summary: 'I need a piano teacher',
          details: 'preferably on weekday evenings',
          remote: true,
          active: true,
        })
      })

      it('rejects an invalid matchingType', async () => {
        const { errors: errorObjects } = await mutate({
          mutation: createMatchingEntry,
          variables: { input: { matchingType: 'nonsense', summary: 'x' } },
        })
        expect(errorObjects).toMatchObject([
          {
            message: 'Argument Validation Error',
            extensions: {
              exception: {
                validationErrors: [{ property: 'matchingType' }],
              },
            },
          },
        ])
      })

      it('rejects a summary longer than 160 characters', async () => {
        const { errors: errorObjects } = await mutate({
          mutation: createMatchingEntry,
          variables: { input: { matchingType: 'offer', summary: 'x'.repeat(161) } },
        })
        expect(errorObjects).toMatchObject([
          {
            message: 'Argument Validation Error',
            extensions: {
              exception: {
                validationErrors: [{ property: 'summary' }],
              },
            },
          },
        ])
      })
    })
  })

  describe('listMatchingEntries', () => {
    describe('unauthenticated', () => {
      it('returns an error', async () => {
        resetToken()
        const { errors: errorObjects } = await query({ query: listMatchingEntries })
        expect(errorObjects).toEqual([new GraphQLError('401 Unauthorized')])
      })
    })

    describe('authenticated', () => {
      beforeAll(async () => {
        await resetEntity(DbMatchingEntry)
        await loginBibi()
        await seedEntry({ matchingType: 'offer', summary: 'Bibi offers flying lessons' })
        await seedEntry({ matchingType: 'interest', summary: 'Bibi loves witchcraft' })
        await loginBob()
        await seedEntry({ matchingType: 'need', summary: 'Bob needs bricks' })
      })

      it('returns only the entries of the logged-in user', async () => {
        await loginBibi()
        const res: any = await query({ query: listMatchingEntries })
        const summaries = res.data.listMatchingEntries.map((entry: any) => entry.summary).sort()
        expect(summaries).toEqual(['Bibi loves witchcraft', 'Bibi offers flying lessons'])

        await loginBob()
        const resBob: any = await query({ query: listMatchingEntries })
        expect(resBob.data.listMatchingEntries.map((entry: any) => entry.summary)).toEqual([
          'Bob needs bricks',
        ])
      })
    })

    describe('ordering', () => {
      let firstUuid: string
      let secondUuid: string

      beforeAll(async () => {
        await resetEntity(DbMatchingEntry)
        await loginBibi()
        firstUuid = await seedEntry({ matchingType: 'offer', summary: 'newer entry' })
        secondUuid = await seedEntry({ matchingType: 'offer', summary: 'older entry' })
        // Force distinct update timestamps directly. Creating both entries within
        // the same millisecond would leave the DESC order undefined on a fast CI
        // runner, so we set updated_at a day apart via raw SQL (this bypasses the
        // auto-managed UpdateDateColumn, which would otherwise reset it to now).
        await DbMatchingEntry.getRepository().query(
          'UPDATE matching_entries SET updated_at = ? WHERE uuid = ?',
          ['2024-01-02 00:00:00.000', firstUuid],
        )
        await DbMatchingEntry.getRepository().query(
          'UPDATE matching_entries SET updated_at = ? WHERE uuid = ?',
          ['2024-01-01 00:00:00.000', secondUuid],
        )
      })

      it('lists entries ordered by updatedAt descending', async () => {
        const res: any = await query({ query: listMatchingEntries })
        const uuids = res.data.listMatchingEntries.map((entry: any) => entry.uuid)
        expect(uuids).toEqual([firstUuid, secondUuid])
      })
    })
  })

  describe('updateMatchingEntry', () => {
    let uuid: string

    describe('unauthenticated', () => {
      it('returns an error', async () => {
        resetToken()
        const { errors: errorObjects } = await mutate({
          mutation: updateMatchingEntry,
          variables: {
            uuid: NON_EXISTENT_UUID,
            input: { matchingType: 'offer', summary: 'x' },
          },
        })
        expect(errorObjects).toEqual([new GraphQLError('401 Unauthorized')])
      })
    })

    describe('authenticated', () => {
      beforeAll(async () => {
        await resetEntity(DbMatchingEntry)
        await loginBibi()
        uuid = await seedEntry({ matchingType: 'offer', summary: 'original summary' })
      })

      it('updates the fields of an own entry', async () => {
        const res: any = await mutate({
          mutation: updateMatchingEntry,
          variables: {
            uuid,
            input: {
              matchingType: 'need',
              summary: 'changed summary',
              details: 'now with details',
              remote: true,
            },
          },
        })
        expect(res.data.updateMatchingEntry).toMatchObject({
          uuid,
          matchingType: 'need',
          summary: 'changed summary',
          details: 'now with details',
          remote: true,
        })
        const dbEntry = await DbMatchingEntry.findOneOrFail({ where: { uuid } })
        expect(dbEntry).toMatchObject({
          matchingType: 'need',
          summary: 'changed summary',
          remote: true,
        })
      })

      it('clears optional fields back to their defaults when omitted', async () => {
        const res: any = await mutate({
          mutation: updateMatchingEntry,
          variables: {
            uuid,
            input: { matchingType: 'offer', summary: 'no more details' },
          },
        })
        expect(res.data.updateMatchingEntry).toMatchObject({
          details: null,
          remote: false,
        })
      })

      describe('entry does not exist', () => {
        it('returns an error', async () => {
          jest.clearAllMocks()
          await expect(
            mutate({
              mutation: updateMatchingEntry,
              variables: {
                uuid: NON_EXISTENT_UUID,
                input: { matchingType: 'offer', summary: 'x' },
              },
            }),
          ).resolves.toEqual(
            expect.objectContaining({ errors: [new GraphQLError('MatchingEntry not found')] }),
          )
        })

        it('logs the error "MatchingEntry not found"', () => {
          expect(logErrorLogger.error).toBeCalledWith('MatchingEntry not found', NON_EXISTENT_UUID)
        })
      })

      describe('another user tries to update the entry', () => {
        beforeAll(async () => {
          await loginBob()
        })

        afterAll(async () => {
          await loginBibi()
        })

        it('returns an error', async () => {
          jest.clearAllMocks()
          await expect(
            mutate({
              mutation: updateMatchingEntry,
              variables: {
                uuid,
                input: { matchingType: 'offer', summary: 'hijacked' },
              },
            }),
          ).resolves.toEqual(
            expect.objectContaining({
              errors: [new GraphQLError('Can not access MatchingEntry of another user')],
            }),
          )
        })

        it('logs the error "Can not access MatchingEntry of another user"', () => {
          expect(logErrorLogger.error).toBeCalledWith(
            'Can not access MatchingEntry of another user',
            uuid,
            bob.id,
          )
        })

        it('leaves the entry unchanged', async () => {
          const dbEntry = await DbMatchingEntry.findOneOrFail({ where: { uuid } })
          expect(dbEntry.summary).toBe('no more details')
        })
      })
    })
  })

  describe('setMatchingEntryActive', () => {
    let uuid: string

    beforeAll(async () => {
      await resetEntity(DbMatchingEntry)
      await loginBibi()
      uuid = await seedEntry({ matchingType: 'offer', summary: 'toggle me' })
    })

    it('deactivates an own entry', async () => {
      const res: any = await mutate({
        mutation: setMatchingEntryActive,
        variables: { uuid, active: false },
      })
      expect(res.data.setMatchingEntryActive).toMatchObject({ uuid, active: false })
      const dbEntry = await DbMatchingEntry.findOneOrFail({ where: { uuid } })
      expect(dbEntry.active).toBe(false)
    })

    it('reactivates an own entry', async () => {
      const res: any = await mutate({
        mutation: setMatchingEntryActive,
        variables: { uuid, active: true },
      })
      expect(res.data.setMatchingEntryActive).toMatchObject({ uuid, active: true })
      const dbEntry = await DbMatchingEntry.findOneOrFail({ where: { uuid } })
      expect(dbEntry.active).toBe(true)
    })

    describe('another user tries to toggle the entry', () => {
      beforeAll(async () => {
        await loginBob()
      })

      afterAll(async () => {
        await loginBibi()
      })

      it('returns an error', async () => {
        await expect(
          mutate({ mutation: setMatchingEntryActive, variables: { uuid, active: false } }),
        ).resolves.toEqual(
          expect.objectContaining({
            errors: [new GraphQLError('Can not access MatchingEntry of another user')],
          }),
        )
      })
    })
  })

  describe('deleteMatchingEntry', () => {
    let uuid: string

    describe('unauthenticated', () => {
      it('returns an error', async () => {
        resetToken()
        const { errors: errorObjects } = await mutate({
          mutation: deleteMatchingEntry,
          variables: { uuid: NON_EXISTENT_UUID },
        })
        expect(errorObjects).toEqual([new GraphQLError('401 Unauthorized')])
      })
    })

    describe('authenticated', () => {
      beforeAll(async () => {
        await resetEntity(DbMatchingEntry)
        await loginBibi()
        uuid = await seedEntry({ matchingType: 'offer', summary: 'delete me' })
      })

      describe('another user tries to delete the entry', () => {
        beforeAll(async () => {
          await loginBob()
        })

        afterAll(async () => {
          await loginBibi()
        })

        it('returns an error', async () => {
          await expect(
            mutate({ mutation: deleteMatchingEntry, variables: { uuid } }),
          ).resolves.toEqual(
            expect.objectContaining({
              errors: [new GraphQLError('Can not access MatchingEntry of another user')],
            }),
          )
        })

        it('keeps the entry in the database', async () => {
          const dbEntry = await DbMatchingEntry.findOne({ where: { uuid } })
          expect(dbEntry).not.toBeNull()
        })
      })

      describe('entry does not exist', () => {
        it('returns an error', async () => {
          await expect(
            mutate({ mutation: deleteMatchingEntry, variables: { uuid: NON_EXISTENT_UUID } }),
          ).resolves.toEqual(
            expect.objectContaining({ errors: [new GraphQLError('MatchingEntry not found')] }),
          )
        })
      })

      it('hard-deletes an own entry', async () => {
        const res: any = await mutate({ mutation: deleteMatchingEntry, variables: { uuid } })
        expect(res.data.deleteMatchingEntry).toBe(true)
        const dbEntry = await DbMatchingEntry.findOne({ where: { uuid } })
        expect(dbEntry).toBeNull()
      })
    })
  })
})
