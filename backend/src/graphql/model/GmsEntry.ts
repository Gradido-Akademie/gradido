import { GmsEntry as DbGmsEntry } from 'database'
import { Field, ObjectType } from 'type-graphql'

@ObjectType()
export class GmsEntry {
  constructor(dbGmsEntry: DbGmsEntry) {
    this.entryUuid = dbGmsEntry.entryUuid
    this.entryType = dbGmsEntry.entryType
    this.summary = dbGmsEntry.summary
    this.details = dbGmsEntry.details
    this.remote = dbGmsEntry.remote
    this.active = dbGmsEntry.active
    this.createdAt = dbGmsEntry.createdAt
    this.updatedAt = dbGmsEntry.updatedAt
  }

  @Field(() => String)
  entryUuid: string

  @Field(() => String)
  entryType: string

  @Field(() => String)
  summary: string

  @Field(() => String, { nullable: true })
  details: string | null

  @Field(() => Boolean)
  remote: boolean

  @Field(() => Boolean)
  active: boolean

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date
}
