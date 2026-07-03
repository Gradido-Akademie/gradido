<template>
  <div class="matching-page mt--3">
    <!-- Jump-off to the find map. Shown on every tab. Access needs an active map
         presence (position set AND visible); otherwise the click guides to Position.
         The "map coming soon" branch is a placeholder for the real map navigation. -->
    <div class="matching-header d-flex justify-content-end mx-lg-5 mb-3">
      <button type="button" class="find-btn" @click="showFind = true">
        <i-bi-map class="find-btn__icon" />
        <span class="find-btn__text">
          <span class="find-btn__title">Auf der Karte finden</span>
          <span class="find-btn__sub">Entdecke, wer zu Dir passt</span>
        </span>
      </button>
    </div>

    <!-- Tab bar (entries / about / position) — same pattern as NavContributions -->
    <div class="matching-nav rounded-26 shadow d-flex justify-content-between mx-lg-5 mb-4">
      <BButton
        variant="link"
        class="matching-nav__btn"
        :class="{ 'is-active': tab === 'entries' }"
        @click="goTab('entries')"
      >
        <i-bi-card-list class="me-1" /> Einträge
      </BButton>
      <BButton
        variant="link"
        class="matching-nav__btn"
        :class="{ 'is-active': tab === 'about' }"
        @click="goTab('about')"
      >
        <i-bi-person class="me-1" /> Über mich
      </BButton>
      <BButton
        variant="link"
        class="matching-nav__btn"
        :class="{ 'is-active': tab === 'position' }"
        @click="goTab('position')"
      >
        <i-bi-geo-alt class="me-1" /> Position
      </BButton>
    </div>

    <!-- Entries -->
    <div v-if="tab === 'entries'">
      <template v-if="entries.length">
        <div class="d-flex align-items-center justify-content-between mb-3 mx-2">
          <span class="small text-muted">
            {{ entries.length }} Einträge · {{ liveCount }} live · {{ entries.length - liveCount }} pausiert
          </span>
          <button type="button" class="btn-add" @click="openNew"><i-bi-plus-lg /> Neuer Eintrag</button>
        </div>

        <div
          v-for="e in entries"
          :key="e.id"
          class="bg-white app-box-shadow gradido-border-radius p-3 mb-4"
          :class="{ 'opacity-05': !e.active }"
        >
          <BRow>
            <BCol cols="3" md="2">
              <div
                class="entry-avatar rounded-like-card d-flex align-items-center justify-content-center"
                :class="`type-${e.type}`"
              >
                <i-bi-heart-fill v-if="e.type === 'interesse'" />
                <i-bi-box-seam v-else-if="e.type === 'angebot'" />
                <i-bi-search v-else />
              </div>
            </BCol>
            <BCol class="min-w-0">
              <div class="small text-muted">{{ e.date }}</div>
              <div class="fw-bold">{{ typeWord(e.type) }}</div>
              <div class="word-break">{{ e.summary }}</div>
              <div class="mt-2">
                <span v-if="e.remote" class="badge-soft me-2"><i-bi-globe2 /> Überregional</span>
                <span v-if="!e.active" class="badge-soft">
                  <i-bi-pause-circle /> Pausiert · nicht in der Suche
                </span>
              </div>
            </BCol>
          </BRow>
          <div v-if="e.open && e.details" class="details-box rounded-20 p-2 mt-3">{{ e.details }}</div>
          <BRow class="mt-3 pt-2 border-top text-center small text-muted">
            <BCol v-if="e.details" class="pointer" @click="e.open = !e.open">
              <i-bi-chevron-up v-if="e.open" /><i-bi-chevron-down v-else />
              <div>Details</div>
            </BCol>
            <BCol v-else class="no-details d-flex align-items-center justify-content-center">
              (keine Details)
            </BCol>
            <BCol class="pointer" @click="e.active = !e.active">
              <i-bi-pause v-if="e.active" /><i-bi-play v-else />
              <div>{{ e.active ? 'Pausieren' : 'Aktivieren' }}</div>
            </BCol>
            <BCol class="pointer"><i-bi-pencil /><div>Bearbeiten</div></BCol>
            <BCol class="pointer" @click="del(e)"><i-bi-trash /><div>Löschen</div></BCol>
          </BRow>
        </div>
      </template>

      <div v-else class="text-center text-muted py-5">
        <i-bi-hearts class="empty-icon" />
        <p class="mt-3 mb-3">
          <strong>Noch keine Einträge.</strong><br />
          Biete etwas an, suche etwas, oder teile ein Interesse — und werde gefunden.
        </p>
        <button type="button" class="btn-add" @click="openNew"><i-bi-plus-lg /> Neuer Eintrag</button>
      </div>
    </div>

    <!-- About -->
    <div v-if="tab === 'about'" class="mx-2">
      <label class="fw-bold mb-2 d-block">Wer Du bist — in Deinen eigenen Worten</label>
      <textarea
        v-model="aboutMe"
        class="form-control matching-textarea"
        rows="10"
        placeholder="Erzähl, wer Du bist, was Dich bewegt, was Du teilst — das schafft Vertrauen, bevor jemand Dich anschreibt."
      ></textarea>
      <div class="d-flex justify-content-between align-items-center mt-2">
        <span class="small text-muted">{{ aboutMe.length }} / ~1000 Zeichen</span>
        <BButton variant="gradido" @click="savedNote = true">Speichern</BButton>
      </div>
      <div v-if="savedNote" class="small text-muted mt-2">Gespeichert. (Vorschau — noch ohne Backend)</div>
    </div>

    <!-- Position -->
    <div v-if="tab === 'position'" class="mx-2">
      <p class="small text-muted">
        Verorte Dich auf der Karte, um beim Matching dabei zu sein — Du erscheinst erst, wenn Du das tust.
      </p>
      <div class="mapbox gradido-border-radius d-flex align-items-center justify-content-center my-3">
        <span class="text-muted">
          <i-bi-geo-alt />
          {{ hasPosition ? 'Position gesetzt (Mock)' : 'Karte (Adresse suchen · Pin ziehen)' }}
        </span>
      </div>
      <BButton variant="outline-secondary" @click="mockSetPosition"><i-bi-search /> Adresse suchen</BButton>
      <span v-if="hasPosition" class="small text-muted ms-2">Position gesetzt (zum Testen)</span>
      <div class="mt-3 accuracy-field">
        <label class="small text-muted d-block">Genauigkeit</label>
        <select v-model="accuracy" class="form-select">
          <option value="genau">genau</option>
          <option value="ungefaehr">ungefähr (Umkreis der Community)</option>
        </select>
      </div>
      <div class="d-flex align-items-center justify-content-between border-top mt-3 py-3">
        <div>
          <div class="fw-bold">Bin ich auffindbar?</div>
          <div class="small text-muted">Schaltet Deine Karten-Präsenz an/aus</div>
        </div>
        <div class="form-check form-switch">
          <input v-model="gmsAllowed" class="form-check-input matching-switch" type="checkbox" />
        </div>
      </div>
    </div>

    <!-- Popup: new entry -->
    <BModal v-model="showNew" centered>
      <template #title>Neuer Eintrag</template>
      <template #default>
        <div class="d-flex gap-2 mb-3">
          <button
            v-for="t in types"
            :key="t.key"
            type="button"
            class="type-choice__btn flex-fill"
            :class="[`type-${t.key}`, { 'is-sel': newType === t.key }]"
            @click="newType = t.key"
          >
            <i-bi-heart-fill v-if="t.key === 'interesse'" />
            <i-bi-box-seam v-else-if="t.key === 'angebot'" />
            <i-bi-search v-else />
            <div>{{ t.label }}</div>
          </button>
        </div>

        <div class="cat-label text-center fw-bold mb-3" :class="`cat-${newType}`">
          {{ typeLabel(newType) }}
        </div>

        <label class="small text-muted">… in einem Satz</label>
        <input v-model="newSummary" class="form-control" :placeholder="placeholder" />

        <div class="mt-3">
          <a
            class="small text-muted pointer d-inline-flex align-items-center gap-1"
            @click="showDetails = !showDetails"
          >
            <i-bi-chevron-up v-if="showDetails" /><i-bi-chevron-down v-else />
            Details · Bedingungen · Preis · Gradido
          </a>
          <textarea v-if="showDetails" v-model="newDetails" class="form-control mt-2 matching-textarea" rows="5" style="height: auto"></textarea>
        </div>

        <BFormCheckbox v-model="newRemote" class="mt-3">
          Auch überregional / online verfügbar
        </BFormCheckbox>
      </template>
      <template #footer>
        <BButton variant="secondary" @click="showNew = false">Abbrechen</BButton>
        <BButton variant="gradido" :disabled="!newSummary.trim()" @click="save">Speichern</BButton>
      </template>
    </BModal>

    <!-- Find-map access dialog: guide to Position, or (placeholder) coming-soon note -->
    <BModal v-model="showFind" centered>
      <template #title>{{ findHasAccess ? 'Auf der Karte finden' : 'Zeig Dich zuerst auf der Karte' }}</template>
      <template #default>
        <p v-if="findHasAccess" class="mb-0">
          Die Karte kommt bald. Sobald sie da ist, findest Du hier Menschen, die zu Dir passen.
        </p>
        <p v-else class="mb-0">
          Sobald Du Deine Position gesetzt und Dich auf der Karte sichtbar gemacht hast,
          kannst Du auch andere in Deiner Nähe finden.
        </p>
      </template>
      <template #footer>
        <BButton v-if="findHasAccess" variant="gradido" @click="showFind = false">Alles klar</BButton>
        <template v-else>
          <BButton variant="secondary" @click="showFind = false">Später</BButton>
          <BButton v-if="tab === 'position'" variant="gradido" @click="showFind = false">Verstanden</BButton>
          <BButton v-else variant="gradido" @click="goPositionFromFind">Zur Position</BButton>
        </template>
      </template>
    </BModal>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// The active tab is driven by the route param (/matching/:tab) so the
// right-hand explanation column (MatchingTemplate) can switch in sync
// via $route.params.tab.
const tab = computed(() => route.params.tab || 'entries')
const goTab = (name) => {
  if (tab.value !== name) router.push(`/matching/${name}`)
}

const types = [
  { key: 'interesse', label: 'Ich liebe' },
  { key: 'angebot', label: 'Ich biete' },
  { key: 'gesuch', label: 'Ich suche' },
]

// Mock data (preview) — real backend/DB follows (waiting on Dario)
const entries = ref([
  { id: 1, type: 'interesse', summary: 'Ich liebe Permakultur und Selbstversorgung', details: '', active: true, remote: false, open: false, date: '12. Juni 2026' },
  { id: 2, type: 'angebot', summary: 'Ich biete Hilfe beim Renovieren von Wohnungen', details: 'Wochenends, gegen Gradido oder Nachbarschaftshilfe.\nIch bringe eigenes Werkzeug mit.\nAuch kleinere Elektro- und Malerarbeiten sind möglich.', active: true, remote: false, open: true, date: '8. Juni 2026' },
  { id: 3, type: 'gesuch', summary: 'Ich suche jemanden für meine Steuererklärung', details: '', active: true, remote: false, open: false, date: '2. Juni 2026' },
  { id: 4, type: 'angebot', summary: 'Ich biete Webdesign und Pflege von Webseiten', details: '', active: true, remote: true, open: false, date: '28. Mai 2026' },
])

const aboutMe = ref('')
const savedNote = ref(false)
// Map presence (mock): a user can find others only once positioned AND visible.
const hasPosition = ref(false)
const gmsAllowed = ref(false)
const accuracy = ref('ungefaehr')

// Find-map access dialog
const showFind = ref(false)
const findHasAccess = computed(() => hasPosition.value && gmsAllowed.value)

const showNew = ref(false)
const newType = ref('interesse')
const newSummary = ref('')
const newDetails = ref('')
const newRemote = ref(false)
const showDetails = ref(false)

const liveCount = computed(() => entries.value.filter((e) => e.active).length)
const placeholder = computed(
  () =>
    ({
      interesse: 'z. B. Ich liebe Permakultur und Selbstversorgung',
      angebot: 'z. B. Ich biete Hilfe beim Renovieren von Wohnungen',
      gesuch: 'z. B. Ich suche jemanden für meine Steuererklärung',
    })[newType.value],
)

const typeWords = { interesse: 'Interesse', angebot: 'Angebot', gesuch: 'Gesuch' }
const typeLabels = { interesse: 'Ich liebe', angebot: 'Ich biete', gesuch: 'Ich suche' }
const typeWord = (t) => typeWords[t]
const typeLabel = (t) => typeLabels[t]

// Mock: pretend the user picked an address (real geocoding lands with the backend)
function mockSetPosition() {
  hasPosition.value = true
}
function goPositionFromFind() {
  showFind.value = false
  goTab('position')
}
function openNew() {
  showNew.value = true
  newType.value = 'interesse'
  newSummary.value = ''
  newDetails.value = ''
  newRemote.value = false
  showDetails.value = false
}
function save() {
  entries.value.unshift({
    id: Date.now(),
    type: newType.value,
    summary: newSummary.value.trim(),
    details: newDetails.value.trim(),
    active: true,
    remote: newRemote.value,
    open: false,
    date: 'heute',
  })
  showNew.value = false
}
function del(e) {
  // eslint-disable-next-line no-alert
  if (window.confirm('Diesen Eintrag löschen?')) {
    entries.value = entries.value.filter((x) => x !== e)
  }
}
</script>

<style scoped>
/* Only Matching-specific additions here — everything else comes from the design
   system (buttons: variant="gradido"/"secondary"; cards: app-box-shadow +
   gradido-border-radius; inputs: .form-control/.form-select; spacing/colors:
   Bootstrap utilities). */
.matching-page {
  color: #383838;
}

/* Find-map jump-off button (header, top-right of the content column) */
.find-btn {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: #178d81;
  color: #fff;
  border: none;
  border-radius: 14px;
  padding: 11px 20px;
  cursor: pointer;
}
.find-btn:hover {
  background: #0f6e56;
}
.find-btn__icon {
  font-size: 26px;
}
.find-btn__text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  text-align: left;
}
.find-btn__title {
  font-weight: 700;
  font-size: 16px;
}
.find-btn__sub {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.85);
}

/* Tab bar — same look as NavContributions (grey, active = teal) */
.matching-nav {
  background-color: #d1d1d1;
  padding: 4px;
}
.matching-nav__btn {
  flex: 1;
  color: #000 !important;
  font-size: 14px;
  text-decoration: none;
  border-radius: 25px;
}
.matching-nav__btn.is-active {
  background-color: #178d81;
  color: #fff !important;
  font-weight: 700;
}

/* "New entry" — subtle grey text action (not a CTA) */
.btn-add {
  border: none;
  background: none;
  color: #5f5f5a;
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 4px;
  cursor: pointer;
}
.btn-add:hover {
  color: #383838;
}

/* Entry-type colors (Matching meaning Interest/Offer/Request = RGB) */
.entry-avatar {
  width: 64px;
  height: 64px;
  color: #fff;
  font-size: 28px;
}
.cat-label {
  font-size: 22px;
}
.type-interesse {
  background: #c62828;
}
.type-angebot {
  background: #047006;
}
.type-gesuch {
  background: #0e79bc;
}
.cat-interesse {
  color: #c62828;
}
.cat-angebot {
  color: #047006;
}
.cat-gesuch {
  color: #0e79bc;
}
/* Type-choice buttons: unselected = pale tint with black text/icon;
   selected = full color with white text/icon and a ring */
.type-choice__btn {
  border: none;
  border-radius: 22px;
  color: #383838 !important;
  font-size: 15px;
  padding: 12px 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.type-choice__btn.type-interesse {
  background: #f2caca;
}
.type-choice__btn.type-angebot {
  background: #d3e9c8;
}
.type-choice__btn.type-gesuch {
  background: #cfe6f6;
}
.type-choice__btn svg {
  font-size: 22px;
}
.type-choice__btn.is-sel {
  color: #fff !important;
  box-shadow: 0 0 0 3px rgb(0 0 0 / 18%);
  font-weight: 600;
}
.type-choice__btn.is-sel.type-interesse {
  background: #c62828;
}
.type-choice__btn.is-sel.type-angebot {
  background: #047006;
}
.type-choice__btn.is-sel.type-gesuch {
  background: #0e79bc;
}

/* small status badges on an entry */
.badge-soft {
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 20px;
  background: #f0f1ee;
  color: #5f5f5a;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.details-box {
  background: #f7f8f6;
  font-size: 14px;
  color: #55554f;
  white-space: pre-wrap;
}
/* placeholder so the action row keeps 4 fixed columns when an entry has no details */
.no-details {
  color: #a8a8a2;
  font-style: italic;
}
/* let textareas grow to their rows — the design system forces .form-control to 50px */
.matching-textarea {
  height: auto;
}

/* Position tab: map placeholder + switch */
.mapbox {
  height: 180px;
  background: repeating-linear-gradient(45deg, #eef1ed, #eef1ed 12px, #e8ebe6 12px, #e8ebe6 24px);
}
.accuracy-field {
  max-width: 320px;
}
.matching-switch {
  width: 3em;
  height: 1.5em;
}

.empty-icon {
  font-size: 36px;
  color: #c9ccc6;
}
.min-w-0 {
  min-width: 0;
}
</style>
