<template>
  <!-- No mt--3 here, unlike the other pages: that negative margin exists to pull
       content up under the content header, and this route hides it — so it would
       only glue the page to the top edge. -->
  <div class="matching-map-page">
    <!-- Desktop only. On a phone this row is exactly the space the map wants, and
         the way back moves onto the map instead. -->
    <div class="map-head d-none d-lg-flex align-items-center justify-content-between mx-lg-5 mb-3">
      <div class="min-w-0">
        <div class="map-title">{{ $t('matching.map.title') }}</div>
        <div class="small text-muted">{{ $t('matching.map.subtitle') }}</div>
      </div>
      <button type="button" class="back-btn" @click="goBack">
        <i-bi-arrow-left />
        <span>{{ $t('matching.map.back') }}</span>
      </button>
    </div>

    <div class="map-frame mx-lg-5">
      <div class="map-shell gradido-border-radius app-box-shadow" :class="`look-${look}`">
        <div ref="mapContainer" class="map-canvas" />

        <!-- With the head and the wallet's own bars gone on a phone, this is the
             only way out — so it sits on the map, where the eye already is. -->
        <button
          type="button"
          class="map-back d-lg-none"
          :aria-label="$t('matching.map.back')"
          @click="goBack"
        >
          <i-bi-arrow-left />
        </button>

        <!-- On a phone there is no navbar and no menu, so the coin is the only
             mark left. A mark, not a button: a stray tap while panning should not
             throw you off the map. -->
        <img
          class="map-coin d-lg-none"
          src="/img/brand/gradido_coin_128x128.png"
          alt=""
          aria-hidden="true"
        />

        <!-- Appearance: dark / normal / light. Deliberately its own switch, not the
             wallet's theme — the three looks each serve a different job, and the
             difference between them is itself what the eye reads. -->
        <div class="look-switch" role="group" :aria-label="$t('matching.map.look.label')">
          <button
            v-for="option in LOOKS"
            :key="option"
            type="button"
            class="look-btn"
            :class="{ 'is-on': look === option }"
            :aria-pressed="look === option"
            @click="setLook(option)"
          >
            {{ $t(`matching.map.look.${option}`) }}
          </button>
        </div>
      </div>

      <div class="map-controls bg-white app-box-shadow gradido-border-radius p-3 mt-3">
        <BRow>
          <BCol cols="12" md="7">
            <div class="controls-heading">{{ $t('matching.map.found', { n: foundCount }) }}</div>
            <div class="d-flex flex-wrap gap-3">
              <label v-for="channel in FILTERS" :key="channel" class="map-check">
                <input v-model="visible[channel]" type="checkbox" />
                <span class="box" />
                <span class="swatch" :style="swatchStyle(channel)" />
                {{ $t(`matching.map.channels.${channel}`) }}
              </label>
            </div>
          </BCol>
          <BCol cols="12" md="5" class="mt-3 mt-md-0">
            <div class="controls-heading">{{ $t('matching.map.amplifier') }}</div>
            <label class="map-check">
              <input v-model="breite" type="checkbox" />
              <span class="box" />
              {{ $t('matching.map.breite') }}
            </label>
            <!-- Explanation, not instruction — the first thing to give up for room. -->
            <div class="small text-muted mt-1 ms-4 ps-1 d-none d-lg-block">
              {{ $t('matching.map.breiteHint') }}
            </div>
          </BCol>
        </BRow>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@vue/apollo-composable'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch'
import 'leaflet-geosearch/dist/geosearch.css'
import { userLocationQuery } from '@/graphql/queries'
import { useMatches } from '@/composables/useMatches'
import { useAppToast } from '@/composables/useToast'
import {
  CANON,
  DEFAULTS,
  markerColor,
  peakStage,
  stagesOf,
} from '@/components/Matching/displayCore'

const LOOKS = ['dunkel', 'normal', 'hell']
const FILTERS = ['interesse', 'angebot', 'gesuch', 'andere']
const LOOK_STORAGE_KEY = 'gms.map.look'
const DEFAULT_ZOOM = 12

// Marker sizes in screen pixels per step. They stay constant while zooming, the
// way a pin does — a glow that grew with the zoom would read as a bigger match.
const GLOW_SIZE = { 1: 48, 2: 64, 3: 82, 4: 104 }
const DISC_SIZE = { 1: 20, 2: 28, 3: 38, 4: 48 }

const { t } = useI18n()
const router = useRouter()
const store = useStore()
const { toastError } = useAppToast()

const mapContainer = ref(null)
const look = ref(readLook())
const breite = ref(false)
const visible = reactive({ interesse: true, angebot: true, gesuch: true, andere: true })

const { matches, presence, load } = useMatches()

let map = null
let matchLayer = null
let presenceLayer = null
let ownLayer = null
let canvasRenderer = null

const ownPosition = ref(null)

// The matches the map is showing right now. Drawing and counting both read this
// one list, so the heading can never claim a person the map does not draw.
const visibleMatches = computed(() => {
  const shown = []
  for (const match of matches.value) {
    const stages = stagesOf(match, DEFAULTS, breite.value, visible)
    const peak = peakStage(stages)
    if (peak < 1) continue
    shown.push({ match, stages, peak })
  }
  return shown
})

// Everyone the map is showing — the glowing matches plus the grey rings. They are
// people too, so they count; the filter itself breaks the number down.
const foundCount = computed(
  () => visibleMatches.value.length + (visible.andere ? presence.value.length : 0),
)

const enabled = computed(() => Boolean(store.state.gmsAllowed))
const { onResult, onError } = useQuery(
  userLocationQuery,
  {},
  { fetchPolicy: 'network-only', enabled },
)

onResult(({ data }) => {
  const location = data?.userLocation
  if (!location) return
  // No pin, no map: the entry gate on the matching page says the same thing, and
  // a map centred on nothing would be a riddle rather than an answer.
  if (!location.userLocation) {
    router.replace('/matching/position')
    return
  }
  ownPosition.value = {
    lat: location.userLocation.latitude,
    lng: location.userLocation.longitude,
  }
  load(ownPosition.value)
  drawOwn()
  centerOnOwn()
})
onError((error) => toastError(error.message))

function readLook() {
  const stored = window.localStorage?.getItem(LOOK_STORAGE_KEY)
  return LOOKS.includes(stored) ? stored : 'dunkel'
}

function setLook(next) {
  look.value = next
  window.localStorage?.setItem(LOOK_STORAGE_KEY, next)
}

function goBack() {
  router.push('/matching/entries')
}

function rgb(channels) {
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`
}

function swatchStyle(channel) {
  if (channel === 'andere') return { border: '2px solid rgb(116, 121, 131)' }
  return { background: rgb(CANON[channel]) }
}

function glowHtml(colour, size, share) {
  const core = (share * 0.9).toFixed(2)
  const tint = `${colour[0]}, ${colour[1]}, ${colour[2]}`
  return `<div class="gk-glow" style="width:${size}px;height:${size}px;background:
    radial-gradient(circle closest-side, rgba(255,255,255,${core}) 0%, rgba(255,255,255,0) 20%),
    radial-gradient(circle closest-side, rgba(${tint},1) 0%, rgba(${tint},.5) 32%, rgba(${tint},0) 68%)"></div>`
}

function discHtml(colour, size) {
  return `<div class="gk-disc" style="width:${size}px;height:${size}px;background:${rgb(colour)}"></div>`
}

function drawMatches() {
  if (!map) return
  if (matchLayer) matchLayer.remove()
  matchLayer = L.layerGroup().addTo(map)

  const glowing = look.value === 'dunkel'
  for (const { match, stages, peak } of visibleMatches.value) {
    const colour = markerColor(stages, DEFAULTS)
    const size = glowing ? GLOW_SIZE[peak] : DISC_SIZE[peak]
    const html = glowing
      ? glowHtml(colour, size, DEFAULTS.stageBright[peak - 1])
      : discHtml(colour, size)

    L.marker([match.position.lat, match.position.lng], {
      icon: L.divIcon({
        className: 'gk-marker',
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
      interactive: false,
    }).addTo(matchLayer)
  }
}

function drawPresence() {
  if (!map) return
  if (presenceLayer) presenceLayer.remove()
  presenceLayer = L.layerGroup()
  if (!visible.andere) return

  // Thousands of rings would choke the DOM, so these go on a canvas. The handful
  // of matches above stay divIcons — they are few and they carry real CSS.
  const dark = look.value === 'dunkel'
  const stroke = dark ? 'rgb(116, 121, 131)' : 'rgb(95, 99, 107)'
  const fill = dark ? 'rgb(80, 84, 94)' : 'rgb(150, 154, 162)'
  for (const person of presence.value) {
    L.circleMarker([person.position.lat, person.position.lng], {
      renderer: canvasRenderer,
      radius: 5,
      weight: 2,
      color: stroke,
      fillColor: fill,
      fillOpacity: person.hasEntries ? 1 : 0,
      interactive: false,
    }).addTo(presenceLayer)
  }
  presenceLayer.addTo(map)
}

function drawOwn() {
  if (!map || !ownPosition.value) return
  if (ownLayer) ownLayer.remove()
  const html = `<div class="gk-own">
      <svg viewBox="0 0 32 26" aria-hidden="true">
        <polygon points="1,25 1,7 9,13 16,1 23,13 31,7 31,25" fill="#c69130" stroke="#3a2600" stroke-width="1.4" stroke-linejoin="round"/>
        <rect x="1" y="22" width="30" height="3" fill="#3a2600"/>
      </svg>
      <span class="gk-own-label">${t('matching.map.you')}</span>
    </div>`
  ownLayer = L.marker([ownPosition.value.lat, ownPosition.value.lng], {
    icon: L.divIcon({ className: 'gk-marker', html, iconSize: [34, 40], iconAnchor: [17, 34] }),
    interactive: false,
    zIndexOffset: 500,
  }).addTo(map)
}

function centerOnOwn() {
  if (map && ownPosition.value) {
    map.setView([ownPosition.value.lat, ownPosition.value.lng], DEFAULT_ZOOM)
  }
}

function initMap() {
  if (!mapContainer.value || map) return
  map = L.map(mapContainer.value, { center: [0, 0], zoom: DEFAULT_ZOOM, zoomControl: false })
  L.control.zoom({ position: 'topleft' }).addTo(map)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)

  canvasRenderer = L.canvas({ padding: 0.5 })

  const searchControl = new GeoSearchControl({
    provider: new OpenStreetMapProvider(),
    style: 'button',
    showMarker: false,
    showPopup: false,
    autoClose: true,
    keepResult: false,
    searchLabel: t('matching.map.search'),
  })
  map.addControl(searchControl)

  drawOwn()
  centerOnOwn()
  redraw()
}

function redraw() {
  drawPresence()
  drawMatches()
}

function handleResize() {
  if (map) map.invalidateSize()
}

onMounted(() => {
  // Leaflet needs its container to have a size before it measures itself.
  setTimeout(initMap, 250)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (map) map.remove()
  map = null
  window.removeEventListener('resize', handleResize)
})

watch([matches, presence], redraw, { deep: true })
watch(breite, drawMatches)
watch(visible, redraw, { deep: true })
watch(look, redraw)
</script>

<style lang="scss" scoped>
.map-title {
  font-weight: 700;
  font-size: 16px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #d1d1d1;
  background: #fff;
  border-radius: 26px;
  padding: 7px 14px;
  font-size: 14px;
  color: #383838;
  white-space: nowrap;
}

.map-shell {
  position: relative;
  overflow: hidden;
}

.map-canvas {
  height: 65vh;
  min-height: 380px;
  width: 100%;
}

/* On a phone the page IS the map: it fills the screen, the controls sit right
   under it, and neither needs a scroll. dvh rather than vh, so the browser's own
   collapsing address bar cannot cut the controls off the bottom. */
@media (width <= 991.98px) {
  .matching-map-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    margin-top: 0 !important;
  }

  .map-frame {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .map-shell {
    flex: 1;
    min-height: 0;
    border-radius: 0;
  }

  .map-canvas {
    height: 100%;
    min-height: 0;
  }

  .map-controls {
    border-radius: 0;
    margin-top: 0 !important;
  }

  /* Leaflet parks its zoom buttons top-left, exactly where the way back now sits. */
  .map-shell :deep(.leaflet-top.leaflet-left) {
    margin-top: 44px;
  }
}

/* The air above belongs to the layout, not here: this page sits in the content
   column, and padding here would leave the menu column glued to the top on its
   own. See bareChrome in DashboardLayout. */

/* A third larger than the back arrow — big enough to read as the mark, small
   enough to stay out of the way of the map underneath. */
.map-coin {
  position: absolute;
  bottom: 10px;
  left: 10px;
  z-index: 500;
  width: 41px;
  height: 41px;
  pointer-events: none;
  filter: drop-shadow(0 1px 3px rgb(0 0 0 / 45%));
}

.map-back {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: #383838;
  background: rgb(255 255 255 / 90%);
  border: 0;
  border-radius: 50%;
  box-shadow: 0 1px 5px rgb(0 0 0 / 40%);
}

/* Appearance. The filter belongs on the tile layer alone — put it on the map and
   it takes the zoom buttons, the attribution and our markers down with it. */
.map-shell.look-dunkel :deep(.leaflet-container) {
  background: #0b0c0f;
}

.map-shell.look-dunkel :deep(.leaflet-tile-pane) {
  filter: invert(1) hue-rotate(180deg) brightness(0.32) saturate(0) contrast(1.12);
}

.map-shell.look-hell :deep(.leaflet-container) {
  background: #fff;
}

.map-shell.look-hell :deep(.leaflet-tile-pane) {
  filter: saturate(0) brightness(1.16) contrast(0.94);

  /* A white veil cannot be written as a filter chain; half-transparent tiles over
     a white ground are exactly the same thing and need no extra layer. */
  opacity: 0.5;
}

.look-switch {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 500;
  display: flex;
  gap: 2px;
  padding: 3px;
  background: rgb(255 255 255 / 90%);
  border-radius: 26px;
  box-shadow: 0 1px 5px rgb(0 0 0 / 40%);
}

.look-btn {
  border: 0;
  background: transparent;
  border-radius: 24px;
  padding: 5px 12px;
  font-size: 13px;
  color: #383838;
  line-height: 1.2;

  &.is-on {
    background: #178d81;
    color: #fff;
    font-weight: 700;
  }
}

.controls-heading {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 8px;
}

.map-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
  margin: 0;

  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .box {
    width: 16px;
    height: 16px;
    border-radius: 5px;
    border: 1.5px solid #7a7a7a;
    position: relative;
    flex: 0 0 auto;
  }

  input:checked + .box {
    background: #178d81;
    border-color: #178d81;
  }

  input:checked + .box::after {
    content: '';
    position: absolute;
    left: 4.5px;
    top: 1px;
    width: 4px;
    height: 9px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  input:focus-visible + .box {
    outline: 2px solid #178d81;
    outline-offset: 2px;
  }

  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
}
</style>

<style lang="scss">
/* The marker innards are rendered by Leaflet outside this component's scope. */
.gk-marker {
  background: transparent;
  border: 0;
}

.gk-glow {
  border-radius: 50%;
  filter: blur(3px);
  mix-blend-mode: screen;
}

.gk-disc {
  border-radius: 50%;
  box-sizing: border-box;
  border: 1.8px solid rgb(12 12 12 / 95%);
}

.gk-own {
  position: relative;
  width: 34px;

  svg {
    width: 34px;
    height: auto;
    display: block;
    filter: drop-shadow(0 1px 1px rgb(0 0 0 / 50%));
  }
}

.gk-own-label {
  position: absolute;
  left: 40px;
  top: 2px;
  font-size: 13px;
  font-weight: 700;
  color: #e9c518;
  text-shadow:
    0 0 3px #000,
    0 0 3px #000;
  white-space: nowrap;
}

.look-hell .gk-own-label,
.look-normal .gk-own-label {
  color: #8a6407;
  text-shadow:
    0 0 3px #fff,
    0 0 3px #fff;
}
</style>
