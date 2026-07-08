import Anthropic from '@anthropic-ai/sdk'
import { getLogger } from 'log4js'
import { CONFIG } from '@/config'
import { LOG4JS_BASE_CATEGORY_NAME } from '@/config/const'
import type { CreaContributionInput } from '@/graphql/input/CreaContributionInput'
import type { CreaEvaluation } from '@/graphql/model/CreaEvaluation'
import { CREA_OUTPUT_SCHEMA } from './crea/outputSchema'
import { buildCreaSystemPrompt } from './crea/ruleset'

const logger = getLogger(`${LOG4JS_BASE_CATEGORY_NAME}.apis.anthropic.AnthropicClient`)

// Crea's structured output is small; give the model enough room for the JSON.
const CREA_MAX_TOKENS = 2048

/**
 * Singleton client for the Anthropic (Claude) API, used by the Crea moderation
 * assistant. Mirrors the OpenaiClient shape: disabled unless the API is active
 * and a key is configured.
 */
export class AnthropicClient {
  private static instance: AnthropicClient

  private anthropic: Anthropic

  private constructor() {
    this.anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY })
  }

  public static getInstance(): AnthropicClient | undefined {
    if (!CONFIG.ANTHROPIC_ACTIVE || !CONFIG.ANTHROPIC_API_KEY) {
      logger.info('anthropic is disabled via config...')
      return
    }
    if (!AnthropicClient.instance) {
      AnthropicClient.instance = new AnthropicClient()
    }
    return AnthropicClient.instance
  }

  /**
   * Evaluates a single contribution with Crea and returns the validated
   * structured result. The rules (design docs E/G/D) are sent as a cached
   * system prefix; the contribution and the deterministic code facts follow as
   * the user message. Thin slice (DO-1): one contribution, no history, no
   * persistence yet.
   */
  public async evaluateContribution(input: CreaContributionInput): Promise<CreaEvaluation> {
    const message = await this.anthropic.messages.create({
      model: CONFIG.ANTHROPIC_MODEL,
      max_tokens: CREA_MAX_TOKENS,
      // Thinking disabled for the thin slice (valid on Sonnet 5 / Opus 4.8):
      // yields a single JSON text block and leaves the full budget for output.
      // Adaptive thinking is a later quality knob.
      thinking: { type: 'disabled' },
      system: [
        {
          type: 'text',
          text: buildCreaSystemPrompt(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: this.buildUserMessage(input) }],
      output_config: { format: { type: 'json_schema', schema: CREA_OUTPUT_SCHEMA } },
    })

    logger.info(
      `crea usage: input=${message.usage.input_tokens} cacheRead=${message.usage.cache_read_input_tokens} cacheWrite=${message.usage.cache_creation_input_tokens} output=${message.usage.output_tokens}`,
    )

    return JSON.parse(this.firstTextBlock(message)) as CreaEvaluation
  }

  private firstTextBlock(message: Anthropic.Message): string {
    const block = message.content.find((content) => content.type === 'text')
    if (!block || block.type !== 'text') {
      logger.error('no text block in anthropic response', message.content)
      throw new Error('Crea returned no structured result')
    }
    return block.text
  }

  private buildUserMessage(input: CreaContributionInput): string {
    const lines: string[] = [
      '## Aktuell zu bewerten (ein Beitrag)',
      '',
      input.text,
      '',
      '## Fakten aus dem System',
    ]
    if (input.enteredHours != null) {
      lines.push(`- Eingetragene Stunden (dieser Beitrag): ${input.enteredHours}`)
    }
    if (input.enteredGdd != null) {
      lines.push(`- Eingetragener GDD-Betrag (dieser Beitrag): ${input.enteredGdd}`)
    }
    if (input.monthlyHours != null) {
      lines.push(
        `- Monatssumme Stunden (fuer den Deckel, kein Diskrepanz-Ausloeser): ${input.monthlyHours}`,
      )
    }
    if (input.memberStatus) {
      lines.push(`- Mitglieds-Status: ${input.memberStatus}`)
    }
    if (input.salutation) {
      lines.push(`- Anrede: ${input.salutation}`)
    } else {
      lines.push('- Anrede: unbekannt (Flag anrede_unsicher setzen)')
    }
    lines.push(`- Moderatorname: ${input.moderatorName ?? '[Moderatorname]'}`)
    if (input.date) {
      lines.push(`- Datum: ${input.date}`)
    }
    if (input.isNewMember != null) {
      lines.push(`- Neu-Mitglied: ${input.isNewMember ? 'ja' : 'nein'}`)
    }
    lines.push(
      `- Eingestellte Software-Sprache (fuer reasoning/appliedRule): ${input.uiLanguage ?? 'de'}`,
    )
    return lines.join('\n')
  }
}
