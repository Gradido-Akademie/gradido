import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { Field, InputType } from 'type-graphql'

@InputType()
export class GmsEntryInput {
  @Field(() => String)
  @IsString()
  @IsIn(['offer', 'need', 'interest'])
  entryType: string

  @Field(() => String)
  @IsString()
  @MaxLength(160)
  summary: string

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  details?: string | null

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  remote?: boolean
}
