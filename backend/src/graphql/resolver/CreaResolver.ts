import { CreaContributionInput } from '@input/CreaContributionInput'
import { CreaEvaluation } from '@model/CreaEvaluation'
import { Arg, Authorized, Mutation, Resolver } from 'type-graphql'
import { AnthropicClient } from '@/apis/anthropic/AnthropicClient'
import { RIGHTS } from '@/auth/RIGHTS'

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
    return client.evaluateContribution(input)
  }
}
