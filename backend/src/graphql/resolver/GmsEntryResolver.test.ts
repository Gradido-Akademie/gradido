import { cleanDB, resetEntity, resetToken, testEnvironment } from '@test/helpers'
import { ApolloServerTestClient } from 'apollo-server-testing'
import { getLogger } from 'config-schema/test/testSetup'
import { AppDatabase, GmsEntry as DbGmsEntry, User } from 'database'
import { GraphQLError } from 'graphql'
import { LOG4JS_BASE_CATEGORY_NAME } from '@/config/const'
import { userFactory } from '@/seeds/factory/user'
import {
  createGmsEntry,
  deleteGmsEntry,
  login,
  setGmsEntryActive,
  updateGmsEntry,
} from '@/seeds/graphql/mutations'
import { listGmsEntries } from '@/seeds/graphql/queries'
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
  const res: any = await mutate({ mutation: createGmsEntry, variables: { input } })
  if (res.errors) {
    throw new Error(`seedEntry failed: ${JSON.stringify(res.errors)}`)
  }
  return res.data.createGmsEntry.entryUuid
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

describe('GmsEntryResolver', () => {
  describe('createGmsEntry', () => {
    describe('unauthenticated', () => {
      it('returns an error', async () => {
        resetToken()
        const { errors: errorObjects } = await mutate({
          mutation: createGmsEntry,
          variables: { input: { entryType: 'offer', summary: 'I offer bike repair' } },
        })
        expect(errorObjects).toEqual([new GraphQLError('401 Unauthorized')])
      })
    })

    describe('authenticated', () => {
      beforeAll(async () => {
        await resetEntity(DbGmsEntry)
        await loginBibi()
      })

      it('creates an entry and applies the defaults', async () => {
        const res: any = await mutate({
          mutation: createGmsEntry,
          variables: { input: { entryType: 'offer', summary: 'I offer bike repair' } },
        })
        expect(res.errors).toBeUndefined()
        expect(res.data.createGmsEntry).toMatchObject({
          entryUuid: expect.any(String),
          entryType: 'offer',
          summary: 'I offer bike repair',
          details: null,
          remote: false,
          active: true,
        })
      })

      it('persists all fields with the correct owner', async () => {
        const res: any = await mutate({
          mutation: createGmsEntry,
          variables: {
            input: {
              entryType: 'need',
              summary: 'I need a piano teacher',
              details: 'preferably on weekday evenings',
              remote: true,
            },
          },
        })
        const dbEntry = await DbGmsEntry.findOneOrFail({
          where: { entryUuid: res.data.createGmsEntry.entryUuid },
        })
        expect(dbEntry).toMatchObject({
          userId: bibi.id,
          entryType: 'need',
          summary: 'I need a piano teacher',
          details: 'preferably on weekday evenings',
          remote: true,
          active: true,
        })
      })

      it('rejects an invalid entryType', async () => {
        const { errors: errorObjects } = await mutate({
          mutation: createGmsEntry,
          variables: { input: { entryType: 'nonsense', summary: 'x' } },
        })
        expect(errorObjects).toMatchObject([
          {
            message: 'Argument Validation Error',
            extensions: {
              exception: {
                validationErrors: [{ property: 'entryType' }],
              },
            },
          },
        ])
      })

      it('rejects a summary longer than 160 characters', async () => {
        const { errors: errorObjects } = await mutate({
          mutation: createGmsEntry,
          variables: { input: { entryType: 'offer', summary: 'x'.repeat(161) } },
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

  describe('listGmsEntries', () => {
    describe('unauthenticated', () => {
      it('returns an error', async () => {
        resetToken()
        const { errors: errorObjects } = await query({ query: listGmsEntries })
        expect(errorObjects).toEqual([new GraphQLError('401 Unauthorized')])
      })
    })

    describe('authenticated', () => {
      beforeAll(async () => {
        await resetEntity(DbGmsEntry)
        await loginBibi()
        await seedEntry({ entryType: 'offer', summary: 'Bibi offers flying lessons' })
        await seedEntry({ entryType: 'interest', summary: 'Bibi loves witchcraft' })
        await loginBob()
        await seedEntry({ entryType: 'need', summary: 'Bob needs bricks' })
      })

      it('returns only the entries of the logged-in user', async () => {
        await loginBibi()
        const res: any = await query({ query: listGmsEntries })
        const summaries = res.data.listGmsEntries.map((entry: any) => entry.summary).sort()
        expect(summaries).toEqual(['Bibi loves witchcraft', 'Bibi offers flying lessons'])

        await loginBob()
        const resBob: any = await query({ query: listGmsEntries })
        expect(resBob.data.listGmsEntries.map((entry: any) => entry.summary)).toEqual([
          'Bob needs bricks',
        ])
      })
    })

    describe('ordering', () => {
      let firstUuid: string
      let secondUuid: string

      beforeAll(async () => {
        await resetEntity(DbGmsEntry)
        await loginBibi()
        firstUuid = await seedEntry({ entryType: 'offer', summary: 'newer entry' })
        secondUuid = await seedEntry({ entryType: 'offer', summary: 'older entry' })
        // Force distinct update timestamps directly. Creating both entries within
        // the same millisecond would leave the DESC order undefined on a fast CI
        // runner, so we set updated_at a day apart via raw SQL (this bypasses the
        // auto-managed UpdateDateColumn, which would otherwise reset it to now).
        await DbGmsEntry.getRepository().query(
          'UPDATE gms_entries SET updated_at = ? WHERE entry_uuid = ?',
          ['2024-01-02 00:00:00.000', firstUuid],
        )
        await DbGmsEntry.getRepository().query(
          'UPDATE gms_entries SET updated_at = ? WHERE entry_uuid = ?',
          ['2024-01-01 00:00:00.000', secondUuid],
        )
      })

      it('lists entries ordered by updatedAt descending', async () => {
        const res: any = await query({ query: listGmsEntries })
        const uuids = res.data.listGmsEntries.map((entry: any) => entry.entryUuid)
        expect(uuids).toEqual([firstUuid, secondUuid])
      })
    })
  })

  describe('updateGmsEntry', () => {
    let entryUuid: string

    describe('unauthenticated', () => {
      it('returns an error', async () => {
        resetToken()
        const { errors: errorObjects } = await mutate({
          mutation: updateGmsEntry,
          variables: {
            entryUuid: NON_EXISTENT_UUID,
            input: { entryType: 'offer', summary: 'x' },
          },
        })
        expect(errorObjects).toEqual([new GraphQLError('401 Unauthorized')])
      })
    })

    describe('authenticated', () => {
      beforeAll(async () => {
        await resetEntity(DbGmsEntry)
        await loginBibi()
        entryUuid = await seedEntry({ entryType: 'offer', summary: 'original summary' })
      })

      it('updates the fields of an own entry', async () => {
        const res: any = await mutate({
          mutation: updateGmsEntry,
          variables: {
            entryUuid,
            input: {
              entryType: 'need',
              summary: 'changed summary',
              details: 'now with details',
              remote: true,
            },
          },
        })
        expect(res.data.updateGmsEntry).toMatchObject({
          entryUuid,
          entryType: 'need',
          summary: 'changed summary',
          details: 'now with details',
          remote: true,
        })
        const dbEntry = await DbGmsEntry.findOneOrFail({ where: { entryUuid } })
        expect(dbEntry).toMatchObject({
          entryType: 'need',
          summary: 'changed summary',
          remote: true,
        })
      })

      it('clears optional fields back to their defaults when omitted', async () => {
        const res: any = await mutate({
          mutation: updateGmsEntry,
          variables: {
            entryUuid,
            input: { entryType: 'offer', summary: 'no more details' },
          },
        })
        expect(res.data.updateGmsEntry).toMatchObject({
          details: null,
          remote: false,
        })
      })

      describe('entry does not exist', () => {
        it('returns an error', async () => {
          jest.clearAllMocks()
          await expect(
            mutate({
              mutation: updateGmsEntry,
              variables: {
                entryUuid: NON_EXISTENT_UUID,
                input: { entryType: 'offer', summary: 'x' },
              },
            }),
          ).resolves.toEqual(
            expect.objectContaining({ errors: [new GraphQLError('GmsEntry not found')] }),
          )
        })

        it('logs the error "GmsEntry not found"', () => {
          expect(logErrorLogger.error).toBeCalledWith('GmsEntry not found', NON_EXISTENT_UUID)
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
              mutation: updateGmsEntry,
              variables: {
                entryUuid,
                input: { entryType: 'offer', summary: 'hijacked' },
              },
            }),
          ).resolves.toEqual(
            expect.objectContaining({
              errors: [new GraphQLError('Can not access GmsEntry of another user')],
            }),
          )
        })

        it('logs the error "Can not access GmsEntry of another user"', () => {
          expect(logErrorLogger.error).toBeCalledWith(
            'Can not access GmsEntry of another user',
            entryUuid,
            bob.id,
          )
        })

        it('leaves the entry unchanged', async () => {
          const dbEntry = await DbGmsEntry.findOneOrFail({ where: { entryUuid } })
          expect(dbEntry.summary).toBe('no more details')
        })
      })
    })
  })

  describe('setGmsEntryActive', () => {
    let entryUuid: string

    beforeAll(async () => {
      await resetEntity(DbGmsEntry)
      await loginBibi()
      entryUuid = await seedEntry({ entryType: 'offer', summary: 'toggle me' })
    })

    it('deactivates an own entry', async () => {
      const res: any = await mutate({
        mutation: setGmsEntryActive,
        variables: { entryUuid, active: false },
      })
      expect(res.data.setGmsEntryActive).toMatchObject({ entryUuid, active: false })
      const dbEntry = await DbGmsEntry.findOneOrFail({ where: { entryUuid } })
      expect(dbEntry.active).toBe(false)
    })

    it('reactivates an own entry', async () => {
      const res: any = await mutate({
        mutation: setGmsEntryActive,
        variables: { entryUuid, active: true },
      })
      expect(res.data.setGmsEntryActive).toMatchObject({ entryUuid, active: true })
      const dbEntry = await DbGmsEntry.findOneOrFail({ where: { entryUuid } })
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
          mutate({ mutation: setGmsEntryActive, variables: { entryUuid, active: false } }),
        ).resolves.toEqual(
          expect.objectContaining({
            errors: [new GraphQLError('Can not access GmsEntry of another user')],
          }),
        )
      })
    })
  })

  describe('deleteGmsEntry', () => {
    let entryUuid: string

    describe('unauthenticated', () => {
      it('returns an error', async () => {
        resetToken()
        const { errors: errorObjects } = await mutate({
          mutation: deleteGmsEntry,
          variables: { entryUuid: NON_EXISTENT_UUID },
        })
        expect(errorObjects).toEqual([new GraphQLError('401 Unauthorized')])
      })
    })

    describe('authenticated', () => {
      beforeAll(async () => {
        await resetEntity(DbGmsEntry)
        await loginBibi()
        entryUuid = await seedEntry({ entryType: 'offer', summary: 'delete me' })
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
            mutate({ mutation: deleteGmsEntry, variables: { entryUuid } }),
          ).resolves.toEqual(
            expect.objectContaining({
              errors: [new GraphQLError('Can not access GmsEntry of another user')],
            }),
          )
        })

        it('keeps the entry in the database', async () => {
          const dbEntry = await DbGmsEntry.findOne({ where: { entryUuid } })
          expect(dbEntry).not.toBeNull()
        })
      })

      describe('entry does not exist', () => {
        it('returns an error', async () => {
          await expect(
            mutate({ mutation: deleteGmsEntry, variables: { entryUuid: NON_EXISTENT_UUID } }),
          ).resolves.toEqual(
            expect.objectContaining({ errors: [new GraphQLError('GmsEntry not found')] }),
          )
        })
      })

      it('hard-deletes an own entry', async () => {
        const res: any = await mutate({ mutation: deleteGmsEntry, variables: { entryUuid } })
        expect(res.data.deleteGmsEntry).toBe(true)
        const dbEntry = await DbGmsEntry.findOne({ where: { entryUuid } })
        expect(dbEntry).toBeNull()
      })
    })
  })
})
