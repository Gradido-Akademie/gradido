// AI-GENERATED — not an architecture reference
import { Field, InputType, Int } from 'type-graphql'

// One column of "Meine Gruppen" as the admin sends it (MG5): the groups by number, whether "no
// group" is among them, and whether an administrator handles nothing of its kind (`off`).
@InputType()
export class HandledGroupsInput {
  @Field(() => [Int])
  groupIds: number[]

  @Field(() => Boolean)
  untagged: boolean

  @Field(() => Boolean)
  off: boolean
}
