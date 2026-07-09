import { CreaContributionInput } from '@input/CreaContributionInput'
import { CreaEvaluation } from '@model/CreaEvaluation'
import { Arg, Authorized, Mutation, Resolver } from 'type-graphql'
import { AnthropicClient } from '@/apis/anthropic/AnthropicClient'
import { metaFromInput, persistCreaRecords } from '@/apis/anthropic/crea/records'
import { RIGHTS } from '@/auth/RIGHTS'
import { CONFIG } from '@/config'

@Resolver()
export class CreaResolver {
  @Authorized([RIGHTS.AI_SEND_MESSAGE])
  @Mutation(() => CreaEvaluation)
  async creaEvaluateContribution(
    @Arg('input') input: CreaContributionInput,
  ): Promise<CreaEvaluation> {
    const client = AnthropicClient.getInstance()
    if (!client) {
      throw new Error('Anthropic API is not enabled')
    }
    const evaluation = await client.evaluateContribution(input)
    // Persist one record per activity when the caller supplied a contribution
    // reference (the admin UI in DO-4); the thin slice skips persistence (E-007).
    if (input.contributionRef) {
      await persistCreaRecords(evaluation, metaFromInput(input, CONFIG.ANTHROPIC_MODEL))
    }
    return evaluation
  }
}
