import { User } from 'database'
import { Field, Int, ObjectType } from 'type-graphql'
import { describeModeratorGroups } from '@/graphql/resolver/util/moderatorGroupScope'

@ObjectType()
export class AdminUser {
  constructor(user: User) {
    const role = user.userRoles.length > 0 ? user.userRoles[0] : null
    const groups = describeModeratorGroups(role)
    this.firstName = user.firstName
    this.lastName = user.lastName
    this.role = role ? role.role : ''
    this.visibleGroupTags = groups.tags
    this.seesAllGroups = groups.seesAllGroups
  }

  @Field(() => String)
  firstName: string

  @Field(() => String)
  lastName: string

  @Field(() => String)
  role: string

  // Group functions ("Weg A"): the groups this moderator looks after, so the community
  // info page can list them under that group. Canonical tags without the leading '#' —
  // the display names come from the group list itself and are not duplicated here.
  @Field(() => [String])
  visibleGroupTags: string[]

  // True when no group restriction applies: an unassigned moderator sees every group.
  @Field(() => Boolean)
  seesAllGroups: boolean
}

@ObjectType()
export class SearchAdminUsersResult {
  @Field(() => Int)
  userCount: number

  @Field(() => [AdminUser])
  userList: AdminUser[]
}
