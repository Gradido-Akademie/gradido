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

      <p class="mb-1">
        <strong>{{ $t('crea.response') }}</strong>
      </p>
      <!-- min-height wins over any inherited height; `rows` alone does not take
           effect inside the teleported modal (same issue as the matching textarea). -->
      <BFormTextarea
        v-model="responseText"
        :rows="16"
        style="min-height: 24em"
        class="mb-2"
        @keydown="onResponseKeydown"
      />
      <BButton variant="info" size="sm" @click="copyResponse">
        {{ $t('crea.copy') }}
      </BButton>

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
        <BButton variant="secondary" size="sm" @click="runEvaluation">
          {{ $t('crea.regenerate') }}
        </BButton>
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
import { useBoldShortcut } from '@/composables/useBoldShortcut'

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

const { mutate: evaluateMutation } = useMutation(creaEvaluateContribution)

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
