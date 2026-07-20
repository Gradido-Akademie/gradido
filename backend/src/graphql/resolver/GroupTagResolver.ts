import { GroupTag as DbGroupTag } from 'database'
import { Arg, Authorized, Mutation, Query, Resolver } from 'type-graphql'
import { RIGHTS } from '@/auth/RIGHTS'
import { GroupTag } from '@/graphql/model/GroupTag'
import { LogError } from '@/server/LogError'

// Group functions ("Weg A"): the canonical, admin-managed list of valid group tags.
// Tags are stored WITHOUT the leading '#'. This list feeds submission autocomplete,
// the personal per-user tag lists and the moderator visibility scope.
@Resolver(() => GroupTag)
export class GroupTagResolver {
  @Authorized([RIGHTS.LIST_GROUP_TAGS])
  @Query(() => [GroupTag])
  async groupTags(): Promise<GroupTag[]> {
    const tags = await DbGroupTag.find({ order: { tag: 'ASC' } })
    return tags.map((tag) => new GroupTag(tag))
  }

  @Authorized([RIGHTS.MANAGE_GROUP_TAGS])
  @Mutation(() => GroupTag)
  async createGroupTag(
    @Arg('tag', () => String) tag: string,
    @Arg('name', () => String, { nullable: true }) name?: string | null,
  ): Promise<GroupTag> {
    // Normalise: strip a leading '#', trim, and reject inner whitespace (the classic
    // "# Gruppe" error). The tag is stored in canonical form.
    const normalised = tag.trim().replace(/^#+/, '')
    if (normalised.length === 0 || /\s/.test(normalised)) {
      throw new LogError('Invalid group tag', tag)
    }
    const existing = await DbGroupTag.findOne({ where: { tag: normalised } })
    if (existing) {
      throw new LogError('Group tag already exists', normalised)
    }
    const entry = DbGroupTag.create()
    entry.tag = normalised
    entry.name = name?.trim() ? name.trim() : null
    await DbGroupTag.save(entry)
    return new GroupTag(entry)
  }
}
