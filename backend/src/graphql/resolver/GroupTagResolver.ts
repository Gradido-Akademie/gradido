import { GroupTag as DbGroupTag, UserRole as DbUserRole } from 'database'
import { Arg, Authorized, Int, Mutation, Query, Resolver } from 'type-graphql'
import { Like } from 'typeorm'
import { RIGHTS } from '@/auth/RIGHTS'
import { GroupTag } from '@/graphql/model/GroupTag'
import { LogError } from '@/server/LogError'
import { parseModeratorScope } from './util/findContributions'

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

  // Edit an existing group: rename the display name and/or the canonical slug.
  // The important links — which contributions carry the tag, and each user's personal
  // tag list — reference the numeric id, so they survive a rename untouched. The only
  // string-based reference, the moderator visibility scope, is migrated in lock-step.
  // Deleting is intentionally not offered (a tag in use must not vanish silently).
  @Authorized([RIGHTS.MANAGE_GROUP_TAGS])
  @Mutation(() => GroupTag)
  async updateGroupTag(
    @Arg('id', () => Int) id: number,
    @Arg('tag', () => String, { nullable: true }) tag?: string | null,
    @Arg('name', () => String, { nullable: true }) name?: string | null,
  ): Promise<GroupTag> {
    const entry = await DbGroupTag.findOne({ where: { id } })
    if (!entry) {
      throw new LogError('Group tag not found', id)
    }
    let renamedFrom: string | null = null
    if (tag !== undefined && tag !== null) {
      const normalised = tag.trim().replace(/^#+/, '')
      if (normalised.length === 0 || /\s/.test(normalised)) {
        throw new LogError('Invalid group tag', tag)
      }
      if (normalised !== entry.tag) {
        const clash = await DbGroupTag.findOne({ where: { tag: normalised } })
        if (clash) {
          throw new LogError('Group tag already exists', normalised)
        }
        renamedFrom = entry.tag
        entry.tag = normalised
      }
    }
    if (name !== undefined) {
      entry.name = name?.trim() ? name.trim() : null
    }
    await DbGroupTag.save(entry)
    if (renamedFrom !== null) {
      await this.renameTagInModeratorScopes(renamedFrom, entry.tag)
    }
    return new GroupTag(entry)
  }

  // Migrate a renamed slug through the moderator scopes stored as JSON tag-string arrays
  // on user_roles.visible_group_tags. Bounded to the few roles that carry the old tag;
  // the sentinels '*all'/'*untagged' and every other tag are left as they are.
  private async renameTagInModeratorScopes(oldTag: string, newTag: string): Promise<void> {
    const roles = await DbUserRole.find({ where: { visibleGroupTags: Like(`%${oldTag}%`) } })
    for (const role of roles) {
      const scope = parseModeratorScope(role.visibleGroupTags)
      if (!scope || !scope.includes(oldTag)) {
        continue
      }
      role.visibleGroupTags = JSON.stringify(
        scope.map((token) => (token === oldTag ? newTag : token)),
      )
      await role.save()
    }
  }
}
