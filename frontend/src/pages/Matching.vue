<template>
  <div class="matching-page mt--3">
    <!-- Einstieg zur Such-Karte (separater Glüh-Feld-Dienst; Verlinkung folgt) -->
    <div class="search-tile gradido-border-radius app-box-shadow">
      <div class="ic"><i-bi-compass /></div>
      <div class="flex-grow-1">
        <div class="fw-bold">Auf der Karte suchen</div>
        <div class="hint">Menschen in Deiner Nähe finden — als Glüh-Feld auf der Karte</div>
      </div>
      <i-bi-arrow-right class="tile-arrow" />
    </div>

    <!-- Tab-Leiste (Einträge / Über mich / Position) -->
    <div class="nav-seg">
      <button :class="{ active: tab === 'eintraege' }" @click="tab = 'eintraege'">
        <i-bi-card-list /> Einträge
      </button>
      <button :class="{ active: tab === 'ueber' }" @click="tab = 'ueber'">
        <i-bi-person /> Über mich
      </button>
      <button :class="{ active: tab === 'position' }" @click="tab = 'position'">
        <i-bi-geo-alt /> Position
      </button>
    </div>

    <!-- EINTRÄGE -->
    <div v-if="tab === 'eintraege'">
      <template v-if="entries.length">
        <div class="d-flex align-items-center justify-content-between status-head">
          <span class="status-line">
            {{ entries.length }} Einträge · {{ liveCount }} live · {{ entries.length - liveCount }} pausiert
          </span>
          <button class="btn-teal" @click="openNew"><i-bi-plus-lg /> Neuer Eintrag</button>
        </div>

        <div
          v-for="e in entries"
          :key="e.id"
          class="card-item gradido-border-radius app-box-shadow"
          :class="{ paused: !e.active }"
        >
          <div class="row-top">
            <div class="ava" :class="e.type">
              <i-bi-heart-fill v-if="e.type === 'interesse'" />
              <i-bi-box-seam v-else-if="e.type === 'angebot'" />
              <i-bi-search v-else />
            </div>
            <div class="flex-grow-1 min-w-0">
              <div class="datesmall">{{ e.date }}</div>
              <div class="type-label">{{ typeWord(e.type) }}</div>
              <div class="summary">{{ e.summary }}</div>
              <div class="mt-2">
                <span v-if="e.remote" class="soft"><i-bi-globe2 /> Überregional</span>
                <span v-if="!e.active" class="soft"><i-bi-pause-circle /> Pausiert · nicht in der Suche</span>
              </div>
            </div>
          </div>
          <div v-if="e.open && e.details" class="details-box">{{ e.details }}</div>
          <div class="act-row">
            <div v-if="e.details" class="act" @click="e.open = !e.open">
              <i-bi-chevron-up v-if="e.open" /><i-bi-chevron-down v-else />
              <span>Details</span>
            </div>
            <div class="act" @click="e.active = !e.active">
              <i-bi-pause v-if="e.active" /><i-bi-play v-else />
              <span>{{ e.active ? 'Pausieren' : 'Aktivieren' }}</span>
            </div>
            <div class="act"><i-bi-pencil /><span>Bearbeiten</span></div>
            <div class="act" @click="del(e)"><i-bi-trash /><span>Löschen</span></div>
          </div>
        </div>
      </template>

      <div v-else class="empty-state">
        <i-bi-hearts class="empty-icon" />
        <p class="mt-2 mb-3">
          <strong>Noch keine Einträge.</strong><br />
          Biete etwas an, suche etwas, oder teile ein Interesse — und werde gefunden.
        </p>
        <button class="btn-teal" @click="openNew"><i-bi-plus-lg /> Neuer Eintrag</button>
      </div>
    </div>

    <!-- ÜBER MICH -->
    <div v-if="tab === 'ueber'" class="tab-pad">
      <label class="fw-bold mb-2 d-block">Wer Du bist — in Deinen eigenen Worten</label>
      <textarea
        v-model="aboutMe"
        class="form-control soft-input"
        rows="6"
        placeholder="Erzähl, wer Du bist, was Dich bewegt, was Du teilst — das schafft Vertrauen, bevor jemand Dich anschreibt."
      ></textarea>
      <div class="d-flex justify-content-between align-items-center mt-2">
        <span class="hint">{{ aboutMe.length }} / ~1000 Zeichen</span>
        <button class="btn-teal" @click="savedNote = true">Speichern</button>
      </div>
      <div v-if="savedNote" class="hint mt-2">Gespeichert. (Vorschau — noch ohne Backend)</div>
    </div>

    <!-- POSITION -->
    <div v-if="tab === 'position'" class="tab-pad">
      <p class="hint">
        Verorte Dich auf der Karte, um beim Matching dabei zu sein — Du erscheinst erst, wenn Du das tust.
      </p>
      <div class="mapbox gradido-border-radius">
        <span><i-bi-geo-alt /> Karte (Adresse suchen · Pin ziehen)</span>
      </div>
      <button class="btn-outline-soft"><i-bi-search /> Adresse suchen</button>
      <div class="mt-3 accuracy-field">
        <label class="hint d-block">Genauigkeit</label>
        <select v-model="accuracy" class="form-select soft-input">
          <option value="genau">genau</option>
          <option value="ungefaehr">ungefähr (Umkreis der Community)</option>
        </select>
      </div>
      <div class="switch-row mt-2">
        <div>
          <div class="fw-bold">Bin ich auffindbar?</div>
          <div class="hint">Schaltet Deine Karten-Präsenz an/aus</div>
        </div>
        <div class="form-check form-switch">
          <input v-model="gmsAllowed" class="form-check-input big-switch" type="checkbox" />
        </div>
      </div>
    </div>

    <!-- POPUP: Neuer Eintrag -->
    <div v-if="showNew" class="mtc-backdrop" @click.self="showNew = false">
      <div class="mtc-modal gradido-border-radius">
        <div class="mtc-modal-head">
          <h5 class="fw-bold m-0">Neuer Eintrag</h5>
          <button class="btn-x" @click="showNew = false"><i-bi-x-lg /></button>
        </div>
        <div class="mtc-modal-body">
          <div class="type-choice">
            <button
              v-for="t in types"
              :key="t.key"
              :class="{ sel: newType === t.key }"
              @click="newType = t.key"
            >
              <i-bi-heart v-if="t.key === 'interesse'" />
              <i-bi-box-seam v-else-if="t.key === 'angebot'" />
              <i-bi-search v-else />
              {{ t.label }}
            </button>
          </div>

          <div class="cat-label" :class="newType">
            <i-bi-heart-fill v-if="newType === 'interesse'" />
            <i-bi-box-seam v-else-if="newType === 'angebot'" />
            <i-bi-search v-else />
            {{ typeLabel(newType) }}
          </div>

          <label class="hint">… in einem Satz</label>
          <input v-model="newSummary" class="form-control soft-input" :placeholder="placeholder" />

          <div class="mt-3">
            <a class="hint details-toggle" @click="showDetails = !showDetails">
              <i-bi-chevron-up v-if="showDetails" /><i-bi-chevron-down v-else />
              Details · Bedingungen · Preis · Gradido
            </a>
            <textarea
              v-if="showDetails"
              v-model="newDetails"
              class="form-control soft-input mt-2"
              rows="3"
            ></textarea>
          </div>

          <div class="form-check mt-3">
            <input id="mtc-remote" v-model="newRemote" class="form-check-input" type="checkbox" />
            <label class="form-check-label hint" for="mtc-remote">
              Auch überregional / online verfügbar
            </label>
          </div>
        </div>
        <div class="mtc-modal-foot">
          <button class="btn-light-soft" @click="showNew = false">Abbrechen</button>
          <button class="btn-teal" :disabled="!newSummary.trim()" @click="save">Speichern</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const tab = ref('eintraege')

const types = [
  { key: 'interesse', label: 'Ich liebe' },
  { key: 'angebot', label: 'Ich biete' },
  { key: 'gesuch', label: 'Ich suche' },
]

// Mock-Daten (Vorschau) — echtes Backend/DB folgt (wartet auf Dario)
const entries = ref([
  { id: 1, type: 'interesse', summary: 'Ich liebe Permakultur und Selbstversorgung', details: '', active: true, remote: false, open: false, date: '12. Juni 2026' },
  { id: 2, type: 'angebot', summary: 'Ich biete Hilfe beim Renovieren von Wohnungen', details: 'Wochenends, gegen Gradido oder Nachbarschaftshilfe.', active: true, remote: false, open: false, date: '8. Juni 2026' },
  { id: 3, type: 'gesuch', summary: 'Ich suche jemanden für meine Steuererklärung', details: '', active: false, remote: false, open: false, date: '2. Juni 2026' },
  { id: 4, type: 'angebot', summary: 'Ich biete Webdesign und Pflege von Webseiten', details: '', active: true, remote: true, open: false, date: '28. Mai 2026' },
])

const aboutMe = ref('')
const savedNote = ref(false)
const gmsAllowed = ref(true)
const accuracy = ref('ungefaehr')

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

<style scoped lang="scss">
$teal: #178d81;
$green: #047006;
$blue: #0e79bc;
$rose: #c2557e;

.matching-page {
  color: #383838;
  font-size: 15px;
}

/* --- Such-Kachel --- */
.search-tile {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  padding: 16px 20px;
  margin-bottom: 22px;

  .ic {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    background: $teal;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
  }
  .tile-arrow {
    color: $teal;
    font-size: 20px;
  }
}

/* --- Tab-Leiste --- */
.nav-seg {
  background: #d1d1d1;
  border-radius: 26px;
  display: flex;
  box-shadow: 0 6px 18px rgb(56 56 56 / 14%);
  padding: 4px;
  margin: 0 6px 22px;

  button {
    flex: 1;
    border: none;
    background: transparent;
    color: #000;
    font-size: 14px;
    padding: 10px 6px;
    border-radius: 22px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;

    &.active {
      background: $teal;
      color: #fff;
      font-weight: 700;
    }
  }
}

/* --- Einträge-Liste --- */
.status-head {
  margin: 0 6px 14px;
}
.status-line {
  font-size: 14px;
  color: #6b6b66;
}
.card-item {
  background: #fff;
  padding: 16px 18px;
  margin: 0 6px 20px;

  &.paused {
    opacity: 0.55;
  }
}
.row-top {
  display: flex;
  gap: 16px;
}
.min-w-0 {
  min-width: 0;
}
.ava {
  width: 70px;
  height: 70px;
  border-radius: 16px;
  flex: 0 0 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 30px;

  &.interesse {
    background: $rose;
  }
  &.angebot {
    background: $green;
  }
  &.gesuch {
    background: $blue;
  }
}
.type-label {
  font-weight: 700;
  margin-top: 2px;
}
.summary {
  font-size: 16px;
}
.datesmall {
  font-size: 13px;
  color: #9a9a94;
}
.soft {
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 20px;
  background: #f0f1ee;
  color: #5f5f5a;
  margin-right: 6px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.details-box {
  margin-top: 10px;
  padding: 10px 12px;
  background: #f7f8f6;
  border-radius: 14px;
  font-size: 14px;
  color: #55554f;
}
.act-row {
  display: flex;
  border-top: 1px solid #eee;
  margin-top: 14px;
  padding-top: 10px;
}
.act {
  flex: 1;
  text-align: center;
  color: #8a8a84;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;

  svg {
    font-size: 18px;
  }
  &:hover {
    color: $teal;
  }
}

/* --- Buttons --- */
.btn-teal {
  background: $teal;
  border: none;
  color: #fff;
  border-radius: 22px;
  padding: 9px 20px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;

  &:hover {
    background: #0f6e56;
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
.btn-light-soft {
  background: #f0f1ee;
  border: none;
  border-radius: 22px;
  padding: 9px 20px;
  cursor: pointer;
}
.btn-outline-soft {
  background: #fff;
  border: 1px solid #cfd4cd;
  border-radius: 18px;
  padding: 6px 14px;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

/* --- Über mich / Position --- */
.tab-pad {
  margin: 0 6px;
}
.soft-input {
  border-radius: 16px;
}
.mapbox {
  height: 180px;
  background: repeating-linear-gradient(45deg, #eef1ed, #eef1ed 12px, #e8ebe6 12px, #e8ebe6 24px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9a9a94;
  margin: 12px 0;
  gap: 7px;
}
.accuracy-field {
  max-width: 320px;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-top: 1px solid #ececec;
}
.big-switch {
  width: 3em;
  height: 1.5em;
}
.hint {
  font-size: 13px;
  color: #8a8a84;
}

/* --- Empty state --- */
.empty-state {
  text-align: center;
  padding: 40px 16px;
  color: #77776f;

  .empty-icon {
    font-size: 36px;
    color: #c9ccc6;
  }
}

/* --- Popup --- */
.mtc-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 45%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
  padding: 16px;
}
.mtc-modal {
  background: #fff;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 20px 60px rgb(0 0 0 / 25%);
}
.mtc-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 6px;
}
.mtc-modal-body {
  padding: 6px 20px;
}
.mtc-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 18px;
}
.btn-x {
  border: none;
  background: transparent;
  font-size: 18px;
  color: #8a8a84;
  cursor: pointer;
}
.cat-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 700;
  padding: 12px;
  border-radius: 16px;
  margin-bottom: 14px;
  color: #fff;

  &.interesse {
    background: $rose;
  }
  &.angebot {
    background: $green;
  }
  &.gesuch {
    background: $blue;
  }
}
.type-choice {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;

  button {
    flex: 1;
    border: 1.5px solid #d7dbd5;
    background: #fff;
    border-radius: 16px;
    padding: 12px 6px;
    cursor: pointer;
    font-size: 15px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;

    svg {
      font-size: 22px;
    }
    &.sel {
      border-color: $teal;
      background: #e6f2f0;
      color: $teal;
      font-weight: 600;
    }
  }
}
.details-toggle {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
</style>
