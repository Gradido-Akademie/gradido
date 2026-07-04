import { GmsEntry as DbGmsEntry } from 'database'
import { Arg, Authorized, Ctx, Mutation, Query, Resolver } from 'type-graphql'
import { v4 as uuidv4 } from 'uuid'
import { RIGHTS } from '@/auth/RIGHTS'
import { GmsEntryInput } from '@/graphql/input/GmsEntryInput'
import { GmsEntry } from '@/graphql/model/GmsEntry'
import { Context, getUser } from '@/server/context'
import { LogError } from '@/server/LogError'

const findOwnEntry = async (entryUuid: string, userId: number): Promise<DbGmsEntry> => {
  const entry = await DbGmsEntry.findOne({ where: { entryUuid } })
  if (!entry) {
    throw new LogError('GmsEntry not found', entryUuid)
  }
  if (entry.userId !== userId) {
    throw new LogError('Can not access GmsEntry of another user', entryUuid, userId)
  }
  return entry
}

@Resolver(() => GmsEntry)
export class GmsEntryResolver {
  @Authorized([RIGHTS.LIST_GMS_ENTRY])
  @Query(() => [GmsEntry])
  async listGmsEntries(@Ctx() context: Context): Promise<GmsEntry[]> {
    const user = getUser(context)
    const entries = await DbGmsEntry.find({
      where: { userId: user.id },
      order: { updatedAt: 'DESC' },
    })
    return entries.map((entry) => new GmsEntry(entry))
  }

  @Authorized([RIGHTS.CREATE_GMS_ENTRY])
  @Mutation(() => GmsEntry)
  async createGmsEntry(
    @Arg('input', () => GmsEntryInput) input: GmsEntryInput,
    @Ctx() context: Context,
  ): Promise<GmsEntry> {
    const user = getUser(context)
    const entry = DbGmsEntry.create()
    entry.entryUuid = uuidv4()
    entry.userId = user.id
    entry.entryType = input.entryType
    entry.summary = input.summary
    entry.details = input.details ?? null
    entry.remote = input.remote ?? false
    entry.active = true
    await DbGmsEntry.save(entry)
    return new GmsEntry(entry)
  }

  @Authorized([RIGHTS.UPDATE_GMS_ENTRY])
  @Mutation(() => GmsEntry)
  async updateGmsEntry(
    @Arg('entryUuid', () => String) entryUuid: string,
    @Arg('input', () => GmsEntryInput) input: GmsEntryInput,
    @Ctx() context: Context,
  ): Promise<GmsEntry> {
    const user = getUser(context)
    const entry = await findOwnEntry(entryUuid, user.id)
    entry.entryType = input.entryType
    entry.summary = input.summary
    entry.details = input.details ?? null
    entry.remote = input.remote ?? false
    await DbGmsEntry.save(entry)
    return new GmsEntry(entry)
  }

  @Authorized([RIGHTS.UPDATE_GMS_ENTRY])
  @Mutation(() => GmsEntry)
  async setGmsEntryActive(
    @Arg('entryUuid', () => String) entryUuid: string,
    @Arg('active', () => Boolean) active: boolean,
    @Ctx() context: Context,
  ): Promise<GmsEntry> {
    const user = getUser(context)
    const entry = await findOwnEntry(entryUuid, user.id)
    entry.active = active
    await DbGmsEntry.save(entry)
    return new GmsEntry(entry)
  }

  @Authorized([RIGHTS.DELETE_GMS_ENTRY])
  @Mutation(() => Boolean)
  async deleteGmsEntry(
    @Arg('entryUuid', () => String) entryUuid: string,
    @Ctx() context: Context,
  ): Promise<boolean> {
    const user = getUser(context)
    const entry = await findOwnEntry(entryUuid, user.id)
    await entry.remove()
    return true
  }
}
