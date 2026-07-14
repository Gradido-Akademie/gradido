import { MatchingEntry as DbMatchingEntry } from 'database'
import { Arg, Authorized, Ctx, Mutation, Query, Resolver } from 'type-graphql'
import { v4 as uuidv4 } from 'uuid'
import { RIGHTS } from '@/auth/RIGHTS'
import { MatchingEntryInput } from '@/graphql/input/MatchingEntryInput'
import { MatchingEntry } from '@/graphql/model/MatchingEntry'
import { Context, getUser } from '@/server/context'
import { LogError } from '@/server/LogError'
import { removeMatchingEntryFromGms, syncMatchingEntryToGms } from './util/syncMatchingEntryToGms'

const findOwnEntry = async (uuid: string, userId: number): Promise<DbMatchingEntry> => {
  const entry = await DbMatchingEntry.findOne({ where: { uuid } })
  if (!entry) {
    throw new LogError('MatchingEntry not found', uuid)
  }
  if (entry.userId !== userId) {
    throw new LogError('Can not access MatchingEntry of another user', uuid, userId)
  }
  return entry
}

@Resolver(() => MatchingEntry)
export class MatchingEntryResolver {
  @Authorized([RIGHTS.LIST_MATCHING_ENTRY])
  @Query(() => [MatchingEntry])
  async listMatchingEntries(@Ctx() context: Context): Promise<MatchingEntry[]> {
    const user = getUser(context)
    const entries = await DbMatchingEntry.find({
      where: { userId: user.id },
      order: { updatedAt: 'DESC' },
    })
    return entries.map((entry) => new MatchingEntry(entry))
  }

  @Authorized([RIGHTS.CREATE_MATCHING_ENTRY])
  @Mutation(() => MatchingEntry)
  async createMatchingEntry(
    @Arg('input', () => MatchingEntryInput) input: MatchingEntryInput,
    @Ctx() context: Context,
  ): Promise<MatchingEntry> {
    const user = getUser(context)
    const entry = DbMatchingEntry.create()
    entry.uuid = uuidv4()
    entry.userId = user.id
    entry.matchingType = input.matchingType
    entry.summary = input.summary
    entry.details = input.details ?? null
    entry.remote = input.remote ?? false
    entry.active = true
    await DbMatchingEntry.save(entry)
    await syncMatchingEntryToGms(user, entry)
    return new MatchingEntry(entry)
  }

  @Authorized([RIGHTS.UPDATE_MATCHING_ENTRY])
  @Mutation(() => MatchingEntry)
  async updateMatchingEntry(
    @Arg('uuid', () => String) uuid: string,
    @Arg('input', () => MatchingEntryInput) input: MatchingEntryInput,
    @Ctx() context: Context,
  ): Promise<MatchingEntry> {
    const user = getUser(context)
    const entry = await findOwnEntry(uuid, user.id)
    entry.matchingType = input.matchingType
    entry.summary = input.summary
    entry.details = input.details ?? null
    entry.remote = input.remote ?? false
    await DbMatchingEntry.save(entry)
    await syncMatchingEntryToGms(user, entry)
    return new MatchingEntry(entry)
  }

  @Authorized([RIGHTS.UPDATE_MATCHING_ENTRY])
  @Mutation(() => MatchingEntry)
  async setMatchingEntryActive(
    @Arg('uuid', () => String) uuid: string,
    @Arg('active', () => Boolean) active: boolean,
    @Ctx() context: Context,
  ): Promise<MatchingEntry> {
    const user = getUser(context)
    const entry = await findOwnEntry(uuid, user.id)
    entry.active = active
    await DbMatchingEntry.save(entry)
    // Pausing removes it from the GMS, resuming puts it back - the sync reads the
    // state and does the right thing either way.
    await syncMatchingEntryToGms(user, entry)
    return new MatchingEntry(entry)
  }

  @Authorized([RIGHTS.DELETE_MATCHING_ENTRY])
  @Mutation(() => Boolean)
  async deleteMatchingEntry(
    @Arg('uuid', () => String) uuid: string,
    @Ctx() context: Context,
  ): Promise<boolean> {
    const user = getUser(context)
    const entry = await findOwnEntry(uuid, user.id)
    await entry.remove()
    // The row is gone here; the GMS copy has to follow, and a lost delete would
    // leave it behind for good - so this one is retried.
    await removeMatchingEntryFromGms(uuid)
    return true
  }
}
