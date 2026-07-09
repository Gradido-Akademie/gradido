import { CreaContributionInput } from '@input/CreaContributionInput'
import { CreaEvaluation } from '@model/CreaEvaluation'
import { Arg, Authorized, Mutation, Resolver } from 'type-graphql'
import { AnthropicClient } from '@/apis/anthropic/AnthropicClient'
import { metaFromInput, persistCreaRecords } from '@/apis/anthropic/crea/records'
import { buildStubEvaluation } from '@/apis/anthropic/crea/stub'
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
    let evaluation: CreaEvaluation
    if (client) {
      evaluation = await client.evaluateContribution(input)
    } else if (CONFIG.CREA_STUB) {
      // Staging preview before the API key (DO-5): a canned evaluation that still
      // runs the deterministic layer and persists, so the whole UI/DB path works.
      evaluation = buildStubEvaluation(input)
    } else {
      throw new Error('Anthropic API is not enabled')
    }
    // Persist one record per activity when the caller supplied a contribution
    // reference (the admin UI, DO-4); the thin slice skips persistence (E-007).
    if (input.contributionRef) {
      await persistCreaRecords(evaluation, metaFromInput(input, CONFIG.ANTHROPIC_MODEL))
    }
    return evaluation
  }
}
