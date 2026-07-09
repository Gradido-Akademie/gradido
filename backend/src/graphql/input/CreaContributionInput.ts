import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator'
import { Field, Float, InputType } from 'type-graphql'

// One "Vorgang" for Crea: the contribution text plus the deterministic
// money/context facts the software supplies (design doc `G`, chapter 5).
// v1 thin slice keeps everything but the text optional; DO-4 wires the facts
// from the account/session.
@InputType()
export class CreaContributionInput {
  @Field()
  @IsString()
  text: string

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  enteredHours?: number | null

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  enteredGdd?: number | null

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  monthlyHours?: number | null

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  memberStatus?: string | null

  // The recipient's first name — used ONLY locally to build the salutation and
  // fill the [ANREDE] placeholder; never forwarded to the Anthropic API (PII
  // stays local, E-012). `salutation` below is an optional pre-built override.
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  recipientFirstName?: string | null

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  salutation?: string | null

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  moderatorName?: string | null

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  date?: string | null

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isNewMember?: boolean | null

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  uiLanguage?: string | null
}
