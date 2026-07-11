import Anthropic from '@anthropic-ai/sdk'
import { getLogger } from 'log4js'
import { CONFIG } from '@/config'
import { LOG4JS_BASE_CATEGORY_NAME } from '@/config/const'
import type { CreaContributionInput } from '@/graphql/input/CreaContributionInput'
import type { CreaEvaluation } from '@/graphql/model/CreaEvaluation'
import type { CreaRewriteResult } from '@/graphql/model/CreaRewriteResult'
import {
  resolveEnteredGdd,
  resolveEnteredHours,
  SALUTATION_PLACEHOLDER,
  SIGNATURE_PLACEHOLDER,
} from './crea/deterministics'
import { CREA_OUTPUT_SCHEMA, CREA_REWRITE_SCHEMA } from './crea/outputSchema'
import { applyCreaDeterministics, fillSalutation } from './crea/postprocess'
import { buildCreaSystemPrompt, moderatorDecisionLabel } from './crea/ruleset'

const logger = getLogger(`${LOG4JS_BASE_CATEGORY_NAME}.apis.anthropic.AnthropicClient`)

// Crea's structured JSON output is usually small, but a contribution with many
// activities (e.g. a long, semicolon-separated list) yields a longer activities array
// plus reasoning and reply. Give generous room: at 2048 such a case was truncated
// mid-JSON, which reached the moderator as a JSON parse error. This is only a ceiling -
// normal evaluations stop well before it, so a higher limit costs nothing.
const CREA_MAX_TOKENS = 8192

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

    this.assertNotTruncated(message)
    const evaluation = JSON.parse(this.firstTextBlock(message)) as CreaEvaluation
    // Layer-3 post-processing (authoritative discrepancy + local [ANREDE] /
    // [SIGNATUR] fill) is shared with the stub preview so both paths behave
    // identically (E-012 / E-013).
    return applyCreaDeterministics(input, evaluation)
  }

  /**
   * Rewrites the reply text when the moderator deviates from Crea's own
   * recommendation (E-017). This is NOT a second evaluation: the moderator's
   * target decision and optional context steer a fresh responseText for that
   * outcome. A confirm rewrite additionally yields memoSupplement (E-019) — the
   * short public note appended to the contribution. Uses the slim rewrite schema,
   * so "deny" stays out of the verdict enum and output stays cheap. The cached
   * rules prefix is reused (cache read), so only the small output is billed anew.
   * No persistence.
   */
  public async rewriteResponse(input: CreaContributionInput): Promise<CreaRewriteResult> {
    const message = await this.anthropic.messages.create({
      model: CONFIG.ANTHROPIC_MODEL,
      max_tokens: CREA_MAX_TOKENS,
      thinking: { type: 'disabled' },
      system: [
        {
          type: 'text',
          text: buildCreaSystemPrompt(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: this.buildRewriteUserMessage(input) }],
      output_config: { format: { type: 'json_schema', schema: CREA_REWRITE_SCHEMA } },
    })

    logger.info(
      `crea rewrite usage: input=${message.usage.input_tokens} cacheRead=${message.usage.cache_read_input_tokens} output=${message.usage.output_tokens}`,
    )

    this.assertNotTruncated(message)
    const parsed = JSON.parse(this.firstTextBlock(message)) as {
      responseText: string
      memoSupplement?: string | null
    }
    // Fill [ANREDE] locally on the reply (PII stays local); [SIGNATUR] is left for
    // the client to fill reactively (E-013 / E-014). No discrepancy recompute: the
    // rewrite does not re-judge, it only reformulates for the chosen outcome.
    // memoSupplement is the plain note only — the 💬 marker + moderator first name
    // are added locally by the client, so that name never reaches the API either.
    return {
      responseText: fillSalutation(input, parsed.responseText).text,
      memoSupplement: parsed.memoSupplement?.trim() || null,
    }
  }

  // A truncated response (max_tokens hit) leaves incomplete JSON, which would fail as a
  // cryptic parse error. Catch it explicitly so the log names the cause and the moderator
  // gets a clear message rather than a JSON crash.
  private assertNotTruncated(message: Anthropic.Message): void {
    if (message.stop_reason === 'max_tokens') {
      logger.error(
        `crea output truncated at max_tokens=${CREA_MAX_TOKENS} (output=${message.usage.output_tokens}); the contribution likely lists many activities`,
      )
      throw new Error('Crea returned an incomplete result (output too long)')
    }
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
    return [
      '## Aktuell zu bewerten (ein Beitrag)',
      '',
      input.text,
      '',
      ...this.systemFacts(input),
    ].join('\n')
  }

  /**
   * Rewrite prompt (E-017): same contribution + system facts, plus the moderator's
   * target decision and optional context. Crea reformulates only the reply text
   * for that outcome (rule chapter 11); it does not re-evaluate.
   */
  private buildRewriteUserMessage(input: CreaContributionInput): string {
    const lines: string[] = [
      '## Beitrag (unveraendert)',
      '',
      input.text,
      '',
      ...this.systemFacts(input),
      '',
      '## Moderator-Vorgabe (weicht von Deiner Empfehlung ab)',
      `- Zielentscheidung: ${moderatorDecisionLabel(input.moderatorDecision)}`,
    ]
    if (input.moderatorContext?.trim()) {
      lines.push(
        `- Zusatzinfo des Moderators (wahr, er kennt den Fall): ${input.moderatorContext.trim()}`,
      )
    }
    lines.push(
      '- Schreibe NUR den neuen Antwortvorschlag fuer diese Zielentscheidung; bewerte nicht neu.',
    )
    return lines.join('\n')
  }

  /** The "## Fakten aus dem System" block, shared by the evaluate and rewrite prompts. */
  private systemFacts(input: CreaContributionInput): string[] {
    const lines: string[] = ['## Fakten aus dem System']
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
    return lines
  }
}
