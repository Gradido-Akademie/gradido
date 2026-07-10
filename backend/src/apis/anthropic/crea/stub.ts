import type { CreaContributionInput } from '@/graphql/input/CreaContributionInput'
import type { CreaEvaluation } from '@/graphql/model/CreaEvaluation'
import {
  resolveEnteredHours,
  SALUTATION_PLACEHOLDER,
  SIGNATURE_PLACEHOLDER,
} from './deterministics'
import { applyCreaDeterministics } from './postprocess'

// Flag the stub carries so the admin UI shows a clear "preview, no AI" banner
// (E-005 — never let a canned result look like a real evaluation).
export const CREA_STUB_FLAG = 'stub_preview'

/**
 * Builds a canned evaluation WITHOUT calling the Anthropic API, then runs the
 * real deterministic layer over it (salutation, discrepancy, signature). Gated
 * by CONFIG.CREA_STUB and only ever reached when no real client is configured
 * (no key). Lets the whole UI + DB + deterministics path be exercised on staging
 * before the API key (DO-5) exists — everything except the model's judgement.
 */
export function buildStubEvaluation(input: CreaContributionInput): CreaEvaluation {
  const hours = resolveEnteredHours(input) ?? 1
  const isEn = (input.uiLanguage ?? 'de').startsWith('en')

  const reasoning = isEn
    ? 'Preview without AI: a sample result to test the interface, the database and the salutation/signature handling. Once the API key is set, Crea’s real assessment appears here.'
    : 'Vorschau ohne KI: ein Beispiel-Ergebnis zum Testen der Oberfläche, der Datenbank und der Anrede-/Signatur-Logik. Sobald der KI-Schlüssel gesetzt ist, steht hier Creas echte Begründung.'

  const body = isEn
    ? 'thank you very much for **your valuable contribution to the common good**. (This is a preview reply — the real wording will come from Crea once the AI is connected.)'
    : 'vielen Dank für **Deinen wertvollen Gemeinwohl-Beitrag**. (Dies ist ein Vorschau-Text — die echte Formulierung kommt von Crea, sobald die KI verbunden ist.)'

  const raw: CreaEvaluation = {
    beitragRef: input.contributionRef ?? '',
    activities: [
      {
        activity: isEn ? 'Sample activity (preview)' : 'Beispiel-Taetigkeit (Vorschau)',
        categoryKey: 'other',
        outputType: 'service',
        hours,
        hoursEstimated: true,
        verdict: 'confirm',
        confidence: 'medium',
      },
    ],
    overallVerdict: 'confirm',
    discrepancy: 'none',
    appliedRule: 'confirm_positive_list',
    confidence: 'medium',
    reasoning,
    responseText: `${SALUTATION_PLACEHOLDER},\n\n${body}\n\n${SIGNATURE_PLACEHOLDER}`,
    openPoints: [],
    flags: [CREA_STUB_FLAG],
  }
  return applyCreaDeterministics(input, raw)
}
