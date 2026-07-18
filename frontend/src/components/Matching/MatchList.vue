<template>
  <div class="match-list">
    <!-- Controls first in reading order: the tally, how it is sorted, and where it
         is centred. On the map these sit around a canvas the eye scans at will; a
         screen reader has no such freedom, so what you reach for comes first. -->
    <div class="list-controls">
      <h2 class="list-count">{{ $t('matching.map.found', { n: count }) }}</h2>

      <div class="list-sort">
        <label class="control-label" for="match-list-sort">{{ $t('matching.list.sortBy') }}</label>
        <select id="match-list-sort" class="sort-select" :value="sortMode" @change="onSort">
          <option value="naehe">{{ $t('matching.list.sortNaehe') }}</option>
          <option value="passung">{{ $t('matching.list.sortPassung') }}</option>
          <option value="breite">{{ $t('matching.list.sortBreite') }}</option>
        </select>
      </div>

      <!-- Typing an address is the only way a blind member can set the centre — a
           map click is not open to them — so this rises from an extra to the way. -->
      <div class="list-search">
        <label class="control-label" for="match-list-search">{{ $t('matching.map.search') }}</label>
        <div class="search-box">
          <input
            id="match-list-search"
            ref="searchInput"
            v-model="query"
            type="text"
            role="combobox"
            autocomplete="off"
            aria-autocomplete="list"
            :aria-expanded="String(results.length > 0)"
            aria-controls="match-list-search-results"
            class="search-input"
            @input="onQuery"
            @keydown.down.prevent="moveResult(1)"
            @keydown.up.prevent="moveResult(-1)"
            @keydown.enter.prevent="chooseActive"
            @keydown.esc="closeResults"
          />
          <ul
            v-if="results.length"
            id="match-list-search-results"
            class="search-results"
            role="listbox"
          >
            <li
              v-for="(result, index) in results"
              :id="`match-list-result-${index}`"
              :key="result.label + index"
              role="option"
              :aria-selected="String(index === activeResult)"
              class="search-result"
              :class="{ 'is-active': index === activeResult }"
              @mousedown.prevent="choose(index)"
            >
              {{ result.label }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Your matches. The heading names the group; each person is one item; the
         order is the ranking, spoken as sequence and never as a number. -->
    <section v-if="matches.length" class="list-section" aria-labelledby="match-list-matches-head">
      <h3 id="match-list-matches-head" class="section-head">
        {{ $t('matching.list.matchesHeading') }}
      </h3>
      <ul class="rows">
        <li v-for="item in matches" :key="item.match.uuid">
          <button type="button" class="row row-match" @click="$emit('open', item.match)">
            <span class="row-dots" aria-hidden="true">
              <span
                v-for="channel in dotsFor(item)"
                :key="channel"
                class="dot"
                :style="{ background: LABEL_COLORS[channel] }"
              />
            </span>
            <span class="row-body">
              <span class="row-head">
                <span class="row-name">{{ item.match.name }}</span>
                <span class="row-sep" aria-hidden="true" />
                <span class="row-community">{{ item.match.community.name }}</span>
              </span>
              <span class="row-where">
                <PlaceText :where="whereOf(item.match)" :dir="dirOf(item.match)" />
              </span>
              <span class="row-line">{{ lineFor(item) }}</span>
              <span v-if="breadthOf(item) >= 2" class="row-breadth">
                {{ $t('matching.list.meets', { n: breadthOf(item) }) }}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <!-- Everyone else nearby who has published something. Not clickable yet: the
         presence route cannot name them, so here they show the reach, not a door
         (that waits on the backend). A silent line is still a line worth hearing
         while the network is small — someone near you, there to be reached. -->
    <section v-if="silent.length" class="list-section" aria-labelledby="match-list-others-head">
      <h3 id="match-list-others-head" class="section-head">
        {{ $t('matching.list.othersHeading') }}
      </h3>
      <ul class="rows">
        <li v-for="person in silent" :key="person.uuid" class="row row-silent">
          <span class="row-body">
            <span class="row-head">
              <span class="row-name">{{ person.name }}</span>
              <span class="row-sep" aria-hidden="true" />
              <span class="row-community">{{ person.community.name }}</span>
            </span>
            <span class="row-where">
              <PlaceText :where="whereOf(person)" :dir="dirOf(person)" />
            </span>
          </span>
        </li>
      </ul>
    </section>

    <p v-if="!matches.length && !silent.length" class="list-empty">
      {{ $t('matching.list.empty') }}
    </p>
  </div>
</template>

<script setup>
import { h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { OpenStreetMapProvider } from 'leaflet-geosearch'
import { distanceKm } from '@/composables/useMatches'
import {
  CHANNELS,
  COMPASS8,
  LABEL_COLORS,
  bearing8,
  describeDistance,
} from '@/components/Matching/displayCore'

const props = defineProps({
  // Each item is { match, stages, peak } — the map's own shape, already filtered
  // and sorted by the parent. `stages` says which channels count for this person.
  matches: { type: Array, default: () => [] },
  // Presence people, filtered and sorted by the parent. Names are a stub today.
  silent: { type: Array, default: () => [] },
  center: { type: Object, default: null },
  myPrecision: { type: String, default: 'genau' },
  count: { type: Number, default: 0 },
  sortMode: { type: String, default: 'naehe' },
})

const emit = defineEmits(['open', 'sort', 'recenter'])

const { t, locale } = useI18n()

function onSort(event) {
  emit('sort', event.target.value)
}

// --- which channels, the strongest line, the breadth ----------------------

/** The matched channels of a person, in the fixed heart-first order. */
function dotsFor(item) {
  return CHANNELS.filter((channel) => (item.stages?.[channel] || 0) >= 1)
}

/** The single strongest matched entry across the visible channels → its line. */
function lineFor(item) {
  let best = null
  let bestChannel = null
  for (const channel of CHANNELS) {
    if ((item.stages?.[channel] || 0) < 1) continue
    for (const entry of item.match.channels?.[channel] || []) {
      if (entry.strength == null) continue
      if (!best || entry.strength > best.strength) {
        best = entry
        bestChannel = channel
      }
    }
  }
  if (!best) return ''
  return t(`matching.list.line.${bestChannel}`, { thing: best.summary })
}

/**
 * How many of my own entries this person answers, across the visible channels.
 * The scores hold one strength per *own* entry answered, so their count is the
 * breadth — the thing the map could only glow and the profile could only imply.
 */
function breadthOf(item) {
  let n = 0
  for (const channel of CHANNELS) {
    if ((item.stages?.[channel] || 0) < 1) continue
    n += (item.match.scores?.[channel] || []).length
  }
  return n
}

// --- distance and direction, spoken honestly ------------------------------

function whereOf(person) {
  if (!props.center) return { band: 'near', km: null, showDirection: false, etwa: false }
  const km = distanceKm(props.center, person.position)
  return describeDistance(km, { mine: props.myPrecision, theirs: person.precision })
}

function dirOf(person) {
  if (!props.center) return 'n'
  return bearing8(props.center, person.position)
}

/**
 * The place line. The distance is real text; the arrow is a decorative echo
 * (aria-hidden) and the bearing rides as a word, so a screen reader speaks it and
 * a sighted eye sees the arrow. The arrow snaps to the same eight points as the
 * word — the picture never claims more than the speech.
 */
const PlaceText = {
  props: { where: Object, dir: String },
  setup(placeProps) {
    return () => {
      const { where, dir } = placeProps
      if (where.band === 'near') return h('span', t('matching.list.near'))
      const n = where.km.toLocaleString(locale.value)
      const distance = where.etwa
        ? t('matching.list.kmEtwa', { n })
        : t('matching.list.kmExact', { n })
      const parts = [distance]
      if (where.showDirection) {
        const deg = COMPASS8.indexOf(dir) * 45
        parts.push(' ')
        parts.push(
          h(
            'svg',
            {
              class: 'dir-arrow',
              viewBox: '0 0 16 16',
              width: 12,
              height: 12,
              'aria-hidden': 'true',
              style: { transform: `rotate(${deg}deg)` },
            },
            [h('path', { d: 'M8 1 L12 9 L8 7 L4 9 Z', fill: 'currentColor' })],
          ),
        )
        parts.push(h('span', { class: 'dir-word' }, t(`matching.list.dir.${dir}`)))
      }
      return h('span', { class: 'place' }, parts)
    }
  },
}

// --- address search (the blind member's only way to set the centre) --------

const provider = new OpenStreetMapProvider()
const searchInput = ref(null)
const query = ref('')
const results = ref([])
const activeResult = ref(-1)
let searchTimer = null

function onQuery() {
  if (searchTimer) clearTimeout(searchTimer)
  const term = query.value.trim()
  if (term.length < 3) {
    results.value = []
    activeResult.value = -1
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      const found = await provider.search({ query: term })
      results.value = found.slice(0, 6)
      activeResult.value = results.value.length ? 0 : -1
    } catch {
      results.value = []
      activeResult.value = -1
    }
  }, 300)
}

function moveResult(step) {
  if (!results.value.length) return
  const next = activeResult.value + step
  activeResult.value = (next + results.value.length) % results.value.length
}

function choose(index) {
  const result = results.value[index]
  if (!result) return
  emit('recenter', { lat: result.y, lng: result.x })
  query.value = ''
  results.value = []
  activeResult.value = -1
}

function chooseActive() {
  if (activeResult.value >= 0) choose(activeResult.value)
}

function closeResults() {
  results.value = []
  activeResult.value = -1
}
</script>

<style lang="scss" scoped>
.match-list {
  height: 100%;
  overflow-y: auto;
  padding: 14px 16px 24px;
  background: var(--bs-body-bg, #fff);
  color: var(--bs-body-color, #2c2c2c);
}

.list-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 14px 20px;
  padding-right: 120px; /* room for the look switch pinned top-right */
  margin-bottom: 16px;
}

.list-count {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  flex: 1 0 100%;
}

.control-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
  margin-bottom: 3px;
}

.sort-select,
.search-input {
  font: inherit;
  font-size: 14px;
  padding: 6px 10px;
  border: 1.5px solid #cdd2da;
  border-radius: 8px;
  background: var(--bs-body-bg, #fff);
  color: inherit;
}

.search-box {
  position: relative;
}

.search-input {
  min-width: 220px;
}

.search-results {
  position: absolute;
  z-index: 20;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--bs-body-bg, #fff);
  border: 1px solid #cdd2da;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 18%);
}

.search-result {
  padding: 7px 9px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;

  &.is-active {
    background: rgb(23 141 129 / 12%);
  }
}

.section-head {
  font-size: 13px;
  font-weight: 700;
  text-transform: none;
  opacity: 0.7;
  margin: 18px 0 6px;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 12px 6px;
  border: 0;
  border-bottom: 1px solid rgb(128 128 128 / 18%);
  background: transparent;
  color: inherit;
}

.row-match {
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: rgb(23 141 129 / 8%);
    outline: none;
  }
}

.row-silent {
  color: inherit;
  opacity: 0.85;
}

.row-dots {
  display: flex;
  gap: 3px;
  padding-top: 4px;
  flex: 0 0 auto;
}

.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}

.row-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.row-head {
  font-size: 15px;
}

.row-name {
  font-weight: 700;
}

/* Decoration, not text — in CSS so it is not read as something to translate. */
.row-sep::before {
  content: '·';
}

.row-sep {
  margin: 0 6px;
  opacity: 0.4;
}

.row-community {
  opacity: 0.8;
}

.row-where {
  font-size: 13px;
  opacity: 0.85;
}

.place {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.dir-arrow {
  color: inherit;
  opacity: 0.7;
}

.row-line {
  font-size: 14px;
}

.row-breadth {
  font-size: 13px;
  font-weight: 600;
  color: #0e7a6e;
}

.list-empty {
  padding: 40px 8px;
  text-align: center;
  opacity: 0.7;
}
</style>
