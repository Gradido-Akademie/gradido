<template>
  <BModal
    id="crea-evaluation-modal"
    v-model="modalVisible"
    size="lg"
    ok-only
    :ok-title="$t('crea.close')"
    :title="$t('crea.title')"
    @shown="onShown"
    @hidden="resetState"
  >
    <!-- The contribution itself, shown at the top from the prop so it is visible the
         moment the modal opens - before Crea's evaluation returns. The large modal hides
         the row behind it, so without this the moderator cannot see what Crea judges. -->
    <div v-if="contributionMemo" class="border rounded p-2 mb-3">
      <div class="d-flex justify-content-between align-items-baseline mb-1">
        <strong>
          {{ contributionUserName || $t('crea.contribution') }}
          <small v-if="contributionTenure" class="text-muted fw-normal">
            ({{ contributionTenure }})
          </small>
        </strong>
        <span v-if="contributionMeta" class="text-muted small ms-3">{{ contributionMeta }}</span>
      </div>
      <p class="mb-0 text-break crea-original">{{ contributionMemo }}</p>
    </div>

    <div v-if="loading" class="text-center py-4">
      <BSpinner class="me-2" />
      {{ $t('crea.loading') }}
    </div>

    <div v-else-if="inactive" class="alert alert-info mb-0">
      {{ $t('crea.inactive') }}
    </div>

    <div v-else-if="errorMessage" class="alert alert-danger mb-0">
      {{ errorMessage }}
    </div>

    <div v-else-if="evaluation">
      <div v-if="stubPreview" class="alert alert-info">{{ $t('crea.previewBanner') }}</div>
      <p class="mb-3">
        <strong>{{ $t('crea.verdict.label') }}:</strong>
        <BBadge :variant="verdictVariant(evaluation.overallVerdict)" class="ms-2">
          <template v-if="evaluation.overallVerdict === 'confirm'">
            {{ $t('crea.verdict.confirm') }}
          </template>
          <template v-else-if="evaluation.overallVerdict === 'inquire'">
            {{ $t('crea.verdict.inquire') }}
          </template>
          <template v-else>{{ evaluation.overallVerdict }}</template>
        </BBadge>
      </p>

      <p class="mb-1">
        <strong>{{ $t('crea.reasoning') }}</strong>
      </p>
      <p class="mb-3 text-break">{{ evaluation.reasoning }}</p>

      <div v-if="visibleFlags.length" class="mb-3">
        <p class="mb-1">
          <strong class="text-danger">{{ $t('crea.flags') }}</strong>
        </p>
        <ul class="mb-0">
          <li v-for="flag in visibleFlags" :key="flag" class="text-danger">
            <template v-if="flag === 'discrepancy_recomputed'">
              {{ $t('crea.flags_map.discrepancy_recomputed') }}
            </template>
            <template v-else-if="flag === 'anrede_unsicher'">
              {{ $t('crea.flags_map.anrede_unsicher') }}
            </template>
            <template v-else>{{ flag }}</template>
          </li>
        </ul>
      </div>

      <div v-if="evaluation.openPoints.length" class="mb-3">
        <p class="mb-1">
          <strong>{{ $t('crea.openPoints') }}</strong>
        </p>
        <ul class="mb-0">
          <li v-for="(point, index) in evaluation.openPoints" :key="index">
            {{ point.question }}
            <small v-if="point.options.length" class="text-muted">
              ({{ point.options.join(' / ') }})
            </small>
          </li>
        </ul>
      </div>

      <!-- Your decision (E-017): Crea's own recommendation is preselected, so
           "follow" means leaving it. Switching is pure UI state and costs nothing;
           only "write for my decision" (shown when you deviate) calls Crea again. -->
      <div class="mb-3">
        <p class="mb-1">
          <strong>{{ $t('crea.deviation') }}</strong>
        </p>
        <div class="btn-group" role="group">
          <BButton
            :variant="chosenDecision === 'confirm' ? 'success' : 'outline-success'"
            size="sm"
            @click="chosenDecision = 'confirm'"
          >
            {{ $t('crea.decision.confirm') }}
          </BButton>
          <BButton
            :variant="chosenDecision === 'inquire' ? 'warning' : 'outline-warning'"
            size="sm"
            @click="chosenDecision = 'inquire'"
          >
            {{ $t('crea.decision.inquire') }}
          </BButton>
          <BButton
            :variant="chosenDecision === 'deny' ? 'danger' : 'outline-danger'"
            size="sm"
            @click="chosenDecision = 'deny'"
          >
            {{ $t('crea.decision.deny') }}
          </BButton>
        </div>

        <div v-if="isDeviation" class="mt-2">
          <BFormTextarea
            v-model="moderatorContext"
            :rows="2"
            :placeholder="$t('crea.contextPlaceholder')"
            class="mb-1"
          />
          <p class="mb-2 text-muted small">{{ $t('crea.contextLabel') }}</p>
          <BButton variant="primary" size="sm" :disabled="rewriting" @click="rewriteForDecision">
            <BSpinner v-if="rewriting" small class="me-1" />
            {{ $t('crea.rewrite') }}
          </BButton>
        </div>
      </div>

      <!-- E-019: on a confirm deviation Crea also drafts a short public note for the
           contribution memo. Editable here; the "Text ergänzen" button in the reply
           form appends it (with the 💬 + first-name marker added locally by the code). -->
      <div v-if="supplementText" class="mb-3">
        <p class="mb-1">
          <strong>{{ $t('crea.supplement') }}</strong>
        </p>
        <BFormInput v-model="supplementText" size="sm" />
        <p class="mt-1 mb-0 text-muted small">{{ $t('crea.supplementHint') }}</p>
      </div>

      <p class="mb-1">
        <strong>{{ $t('crea.response') }}</strong>
      </p>
      <BFormTextarea v-model="responseText" :rows="16" class="mb-2" @keydown="onResponseKeydown" />
      <!-- A new draft comes only from a deviation (the decision buttons above), not
           from a context-free "regenerate" (E-017). So just the copy action here. -->
      <div class="d-flex justify-content-end">
        <BButton variant="info" size="sm" @click="copyResponse">
          {{ $t('crea.copy') }}
        </BButton>
      </div>

      <div class="mt-3">
        <p class="mb-1">
          <strong>{{ $t('crea.signature') }}</strong>
        </p>
        <BFormTextarea
          v-model="moderatorSignature"
          :rows="2"
          :placeholder="$t('crea.signaturePlaceholder')"
          class="mb-2"
        />
        <p class="mt-1 mb-0 text-muted small">{{ $t('crea.signatureHint') }}</p>
      </div>

      <p class="mt-3 mb-0 text-muted small">{{ $t('crea.advisoryHint') }}</p>
    </div>
  </BModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useMutation } from '@vue/apollo-composable'
import { useI18n } from 'vue-i18n'
import { useAppToast } from '@/composables/useToast'
import { creaEvaluateContribution } from '@/graphql/creaEvaluateContribution'
import { creaRewriteResponse } from '@/graphql/creaRewriteResponse'
import { useBoldShortcut } from '@/composables/useBoldShortcut'
import { useCreaClipboard } from '@/composables/useCreaClipboard'
import { useCreaSupplement } from '@/composables/useCreaSupplement'
import { tenureBucket } from '@/utils/tenure'

// Preview flag the backend stub carries so the modal shows a "no AI" banner and
// hides it from the red review flags.
const STUB_PREVIEW_FLAG = 'stub_preview'
// The moderator's signature lives only in the browser (E-014 — no DB field). It is
// filled into the reply locally, so the moderator's name never reaches the server.
const SIGNATURE_STORAGE_KEY = 'crea.moderatorSignature'
// The placeholder Crea closes its reply with; filled in locally with the signature.
const SIGNATURE_PLACEHOLDER = '[SIGNATUR]'

// Crea's evaluation modal for a single contribution (DO-4 v1 slice). Advisory
// only: confirm/deny/send stay the existing table buttons; Crea recommends and
// drafts a warm reply. The contribution is passed in as a prop; the evaluation
// runs lazily when the modal is shown (anti-routine, cheaper).
const props = defineProps({
  contribution: {
    type: Object,
    default: null,
  },
})

const { t, locale } = useI18n()
const { toastSuccess, toastError } = useAppToast()

const modalVisible = ref(false)
const loading = ref(false)
const inactive = ref(false)
const errorMessage = ref('')
const evaluation = ref(null)
const responseText = ref('')
// The backend reply still carries the [SIGNATUR] placeholder; the signature is
// filled in locally and reactively, so it appears the moment it is entered or changed.
const rawResponseText = ref('')
// The moderator's chosen outcome (E-017). Preselected to Crea's own recommendation
// when the evaluation arrives, so "follow" = leave it. Pure UI state until the
// moderator hits "write for my decision".
const chosenDecision = ref(null)
const moderatorContext = ref('')
const rewriting = ref(false)
// The public note Crea drafts for the contribution memo on a confirm rewrite (E-019).
// Editable; empty unless the moderator confirmed a deviation and Crea returned one.
const supplementText = ref('')

const applySignature = (text, signature) =>
  signature ? text.split(SIGNATURE_PLACEHOLDER).join(signature) : text

// Cmd/Ctrl+B wraps the selected text in ** so the moderator gets the familiar
// bold shortcut in the editable draft (rendered bold once the reply is sent).
const { onKeydown: onResponseKeydown } = useBoldShortcut(
  () => responseText.value,
  (value) => {
    responseText.value = value
  },
)

// Hold Crea's current draft (with the moderator's edits) in the browser so it can be
// inserted into the reply field with one click — no OS clipboard needed inside the
// admin. Guard on a real, non-empty evaluation so closing the modal (which clears
// responseText via resetState) never wipes the stored proposal.
const { setLastResponse } = useCreaClipboard()
watch(responseText, (value) => {
  if (evaluation.value && value) {
    setLastResponse(value)
  }
})

// Same bridge for the memo supplement (E-019): hold Crea's note (with the moderator's
// edits) in the browser so the "Text ergänzen" button in the reply form can append it.
// Guard on a non-empty value so closing/resetting the modal never wipes the stored note.
const { setLastSupplement } = useCreaSupplement()
watch(supplementText, (value) => {
  if (value) {
    setLastSupplement(value)
  }
})

const loadSignature = () => {
  try {
    return localStorage.getItem(SIGNATURE_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}
const moderatorSignature = ref(loadSignature())
watch(moderatorSignature, (value, previous) => {
  try {
    localStorage.setItem(SIGNATURE_STORAGE_KEY, value)
  } catch {
    // ignore storage failures (private mode etc.)
  }
  // Keep the draft's signature in sync as long as the moderator hasn't hand-edited it.
  if (evaluation.value && responseText.value === applySignature(rawResponseText.value, previous)) {
    responseText.value = applySignature(rawResponseText.value, value)
  }
})

const stubPreview = computed(() => evaluation.value?.flags?.includes(STUB_PREVIEW_FLAG) ?? false)
const visibleFlags = computed(() =>
  (evaluation.value?.flags ?? []).filter((flag) => flag !== STUB_PREVIEW_FLAG),
)
// The moderator has picked an outcome other than Crea's recommendation.
const isDeviation = computed(
  () => evaluation.value != null && chosenDecision.value !== evaluation.value.overallVerdict,
)

// The original contribution text, taken from the prop so it shows immediately on open
// (independent of the evaluation call). Later, judging several contributions at once,
// this becomes a list separated by thin rules; for now it is the single contribution.
const contributionMemo = computed(() => props.contribution?.memo ?? '')

// Hours (1 h = 20 GDD), the entered GDD and the date, shown next to the heading so the
// moderator sees the contribution's key facts at a glance. Parts join only when present,
// so a missing field simply drops out.
const contributionMeta = computed(() => {
  const c = props.contribution
  if (!c) {
    return ''
  }
  const parts = []
  if (c.amount != null) {
    const gdd = Number(c.amount)
    const hours = gdd / 20
    const hoursText = hours.toLocaleString(locale.value, { maximumFractionDigits: 1 })
    parts.push(`${hoursText} ${t('crea.hoursUnit')}`)
    parts.push(`${gdd.toLocaleString(locale.value)} GDD`)
  }
  if (c.contributionDate) {
    const date = new Date(c.contributionDate)
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleDateString(locale.value))
    }
  }
  return parts.join(' · ')
})

// The participant's full name + registration date, shown as the box heading instead of
// a generic label. Display only: the name stays in our system (like the local [ANREDE]
// fill), never reaches the API, and the persisted record stays pseudonymous.
const contributionUserName = computed(() => {
  const u = props.contribution?.user
  return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : ''
})
// Relative tenure ("seit drei Wochen") instead of an absolute date - quicker to grasp and
// no year mix-ups. The bucket picks the coarse unit; the singular/plural key is chosen
// explicitly (static keys, so the i18n linter sees each one as used).
const contributionTenure = computed(() => {
  const created = props.contribution?.user?.createdAt
  if (!created) {
    return ''
  }
  const bucket = tenureBucket(created)
  if (!bucket) {
    return ''
  }
  const { unit, count } = bucket
  if (unit === 'today') {
    return t('crea.tenure.today')
  }
  if (unit === 'days') {
    return count === 1 ? t('crea.tenure.day') : t('crea.tenure.days', { count })
  }
  if (unit === 'weeks') {
    return count === 1 ? t('crea.tenure.week') : t('crea.tenure.weeks', { count })
  }
  if (unit === 'months') {
    return count === 1 ? t('crea.tenure.month') : t('crea.tenure.months', { count })
  }
  return count === 1 ? t('crea.tenure.year') : t('crea.tenure.years', { count })
})

const { mutate: evaluateMutation } = useMutation(creaEvaluateContribution)
const { mutate: rewriteMutation } = useMutation(creaRewriteResponse)

const buildInput = (contribution) => ({
  text: contribution.memo ?? '',
  // Only the GDD amount is on the row; the backend derives the hours (1 h = 20 GDD).
  enteredGdd: contribution.amount != null ? Number(contribution.amount) : null,
  // Presence of contributionRef makes the resolver persist crea_records (E-007).
  contributionRef: String(contribution.id),
  // Local only: fills the [ANREDE] placeholder, never forwarded to the API (E-012).
  recipientFirstName: contribution.user?.firstName ?? null,
  // Pseudonymous handle for the record — the user id, never a name (E-010).
  personPseudonym: contribution.userId != null ? String(contribution.userId) : null,
  date: contribution.contributionDate ?? null,
  uiLanguage: locale.value,
})

const resetState = () => {
  loading.value = false
  inactive.value = false
  errorMessage.value = ''
  evaluation.value = null
  responseText.value = ''
  rawResponseText.value = ''
  chosenDecision.value = null
  moderatorContext.value = ''
  rewriting.value = false
  supplementText.value = ''
}

const runEvaluation = async () => {
  if (!props.contribution) {
    return
  }
  resetState()
  loading.value = true
  try {
    const response = await evaluateMutation({ input: buildInput(props.contribution) })
    evaluation.value = response.data.creaEvaluateContribution
    rawResponseText.value = evaluation.value.responseText
    responseText.value = applySignature(rawResponseText.value, moderatorSignature.value)
    // Preselect Crea's own recommendation, so switching away = deviating.
    chosenDecision.value = evaluation.value.overallVerdict
    moderatorContext.value = ''
  } catch (error) {
    // Crea stays dormant on staging until the API key (DO-5) is set; the resolver
    // then throws "Anthropic API is not enabled". Show a calm hint, not an error.
    if (/not enabled/i.test(error.message)) {
      inactive.value = true
    } else {
      errorMessage.value = error.message
    }
  } finally {
    loading.value = false
  }
}

// The moderator deviated: ask Crea for a fresh reply text for the chosen outcome
// (+ optional context). Only the reply text changes — Crea's frozen assessment
// (badge, reasoning, open points) stays put, so `rewriting` is separate from
// `loading` (which would hide that whole block). Does not persist (E-017).
const rewriteForDecision = async () => {
  if (!props.contribution || !isDeviation.value) {
    return
  }
  rewriting.value = true
  try {
    const response = await rewriteMutation({
      input: {
        ...buildInput(props.contribution),
        moderatorDecision: chosenDecision.value,
        moderatorContext: moderatorContext.value.trim() || null,
      },
    })
    const result = response.data.creaRewriteResponse
    rawResponseText.value = result.responseText
    responseText.value = applySignature(rawResponseText.value, moderatorSignature.value)
    // A confirm rewrite also carries the public memo note (E-019); inquire/deny return
    // null. Surfacing it fills the editable field above and the "Text ergänzen" button.
    supplementText.value = result.memoSupplement ?? ''
  } catch (error) {
    toastError(error.message)
  } finally {
    rewriting.value = false
  }
}

// The modal stays mounted, so re-read the signature from the browser every time
// it opens. Reading it only once at setup meant a signature stored in an earlier
// session (or after a re-login) never showed up without a full page reload.
const onShown = () => {
  moderatorSignature.value = loadSignature()
  runEvaluation()
}

const verdictVariant = (verdict) => {
  if (verdict === 'confirm') {
    return 'success'
  }
  if (verdict === 'inquire') {
    return 'warning'
  }
  return 'secondary'
}

const copyResponse = async () => {
  try {
    await navigator.clipboard.writeText(responseText.value)
    toastSuccess(t('crea.copied'))
  } catch {
    toastError(t('crea.copyFailed'))
  }
}
</script>

<style scoped>
.crea-original {
  white-space: pre-line;
}
</style>
