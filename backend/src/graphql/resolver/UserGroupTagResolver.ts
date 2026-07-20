import { Arg, Authorized, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql'
import { RIGHTS } from '@/auth/RIGHTS'
import { GroupTag } from '@/graphql/model/GroupTag'
import { Context, getUser } from '@/server/context'
import { loadUserGroupTags, saveUserGroupTags } from './util/userGroupTags'

// Group functions ("Weg A"): a user's personal group-tag list. Users manage their own
// list (first tag = main tag, pre-filled on submission); moderators may edit any user's
// list — healing a forgotten/misspelled tag at the source, not just on one contribution.
@Resolver(() => GroupTag)
export class UserGroupTagResolver {
  @Authorized([RIGHTS.MANAGE_OWN_GROUP_TAGS])
  @Query(() => [GroupTag])
  async myGroupTags(@Ctx() context: Context): Promise<GroupTag[]> {
    const user = getUser(context)
    return (await loadUserGroupTags(user.id)).map((tag) => new GroupTag(tag))
  }

  @Authorized([RIGHTS.MANAGE_OWN_GROUP_TAGS])
  @Mutation(() => [GroupTag])
  async setMyGroupTags(
    @Arg('tags', () => [String]) tags: string[],
    @Ctx() context: Context,
  ): Promise<GroupTag[]> {
    const user = getUser(context)
    return (await saveUserGroupTags(user.id, tags)).map((tag) => new GroupTag(tag))
  }

  @Authorized([RIGHTS.MANAGE_USER_GROUP_TAGS])
  @Query(() => [GroupTag])
  async userGroupTags(@Arg('userId', () => Int) userId: number): Promise<GroupTag[]> {
    return (await loadUserGroupTags(userId)).map((tag) => new GroupTag(tag))
  }

  @Authorized([RIGHTS.MANAGE_USER_GROUP_TAGS])
  @Mutation(() => [GroupTag])
  async setUserGroupTags(
    @Arg('userId', () => Int) userId: number,
    @Arg('tags', () => [String]) tags: string[],
  ): Promise<GroupTag[]> {
    return (await saveUserGroupTags(userId, tags)).map((tag) => new GroupTag(tag))
  }
}
