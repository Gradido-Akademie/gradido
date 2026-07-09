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

  // The moderator's own greeting, filled locally into the [SIGNATUR] placeholder
  // so the moderator's name never reaches the API (E-013).
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  moderatorSignature?: string | null

  // Persistence metadata (E-007/E-010); the admin UI (DO-4) supplies these. When
  // contributionRef is present, the resolver persists crea_records rows.
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  contributionRef?: string | null

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  communityUuid?: string | null

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  personPseudonym?: string | null

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
