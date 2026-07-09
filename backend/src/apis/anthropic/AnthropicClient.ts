import Anthropic from '@anthropic-ai/sdk'
import { getLogger } from 'log4js'
import { CONFIG } from '@/config'
import { LOG4JS_BASE_CATEGORY_NAME } from '@/config/const'
import type { CreaContributionInput } from '@/graphql/input/CreaContributionInput'
import type { CreaEvaluation } from '@/graphql/model/CreaEvaluation'
import {
  buildSalutation,
  computeDiscrepancy,
  resolveEnteredGdd,
  resolveEnteredHours,
  SALUTATION_PLACEHOLDER,
  SIGNATURE_PLACEHOLDER,
  sumActivityHours,
} from './crea/deterministics'
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

    const evaluation = JSON.parse(this.firstTextBlock(message)) as CreaEvaluation
    return this.applyDeterministics(input, evaluation)
  }

  /**
   * Layer-3 post-check (design docs `G` ch. 5, E-012): the code owns the
   * discrepancy flag. It recomputes the direction-aware discrepancy from Crea's
   * extracted activity hours versus the entered hours and overwrites whatever
   * the model proposed. A divergence is flagged (`discrepancy_recomputed`) so
   * the UI can surface it to the moderator (E-005); the verdict and response
   * text stay as Crea wrote them (no silent prose/flag mismatch).
   */
  private applyDeterministics(
    input: CreaContributionInput,
    evaluation: CreaEvaluation,
  ): CreaEvaluation {
    const enteredHours = resolveEnteredHours(input)
    const extractedHours = sumActivityHours(evaluation)
    const authoritative = computeDiscrepancy(extractedHours, enteredHours, input.memberStatus)
    if (authoritative !== evaluation.discrepancy) {
      logger.info(
        `crea discrepancy corrected: model=${evaluation.discrepancy} code=${authoritative} (extracted=${extractedHours ?? 'n/a'} entered=${enteredHours ?? 'n/a'})`,
      )
      evaluation.flags = [...(evaluation.flags ?? []), 'discrepancy_recomputed']
    }
    evaluation.discrepancy = authoritative

    // Fill the [ANREDE] placeholder locally so the recipient's name never
    // reaches the API; flag an uncertain salutation for the moderator (E-005).
    const { salutation, uncertain } = buildSalutation(input.recipientFirstName, input.salutation)
    evaluation.responseText = evaluation.responseText.split(SALUTATION_PLACEHOLDER).join(salutation)
    if (uncertain) {
      evaluation.flags = [...(evaluation.flags ?? []), 'anrede_unsicher']
    }

    // Fill the [SIGNATUR] placeholder with the moderator's own greeting (E-013);
    // the moderator's name never reaches the API. Left in place when unset so the
    // moderator notices and configures it once (DO-4).
    if (input.moderatorSignature) {
      evaluation.responseText = evaluation.responseText
        .split(SIGNATURE_PLACEHOLDER)
        .join(input.moderatorSignature)
    }
    return evaluation
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
    // The code supplies both figures (1 h = 20 GDD); Crea never back-calculates.
    const enteredHours = resolveEnteredHours(input)
    const enteredGdd = resolveEnteredGdd(input)
    if (enteredHours != null) {
      lines.push(`- Eingetragene Stunden (dieser Beitrag): ${enteredHours}`)
    }
    if (enteredGdd != null) {
      lines.push(`- Eingetragener GDD-Betrag (dieser Beitrag): ${enteredGdd}`)
    }
    if (input.monthlyHours != null) {
      lines.push(
        `- Monatssumme Stunden (fuer den Deckel, kein Diskrepanz-Ausloeser): ${input.monthlyHours}`,
      )
    }
    if (input.memberStatus) {
      lines.push(`- Mitglieds-Status: ${input.memberStatus}`)
    }
    lines.push(
      `- Anrede: mit dem Platzhalter ${SALUTATION_PLACEHOLDER} beginnen (der Code fuellt den Namen lokal ein)`,
    )
    lines.push(
      `- Grussformel: mit dem Platzhalter ${SIGNATURE_PLACEHOLDER} abschliessen (der Code fuellt die Moderator-Signatur lokal ein)`,
    )
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
