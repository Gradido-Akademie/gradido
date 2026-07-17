import { ref } from 'vue'

/**
 * The seam between the glow map and its data.
 *
 * Right now this serves a stub. Once the GMS match route is merged and reachable,
 * only `load()` below changes — the map component never learns which side it got
 * its people from, so going live swaps the source, not the component.
 *
 * A search, as both sides of this seam mean it:
 *
 *   { center: { lat, lng }, radius }   // radius in km
 *
 * The centre is the deliberate one, not the map's — panning around is looking,
 * and looking must not search. Both routes take the radius as a required
 * parameter, so the stub demands it too: a stub that answers questions the real
 * thing would refuse teaches the caller a contract that does not exist.
 *
 * A match, as the map wants it:
 *
 *   {
 *     uuid:     string,
 *     name:     string,
 *     position: { lat, lng },   // already blurred by the GMS, never the front door
 *     scores:   { interesse?: number[], angebot?: number[], gesuch?: number[] },
 *   }
 *
 * `scores` holds one value per *own* entry this person answers on that channel.
 * That is what lets breadth ("who fits more than once") count my needs rather
 * than their offers.
 *
 * Presence is everyone else in range — on the map they are the grey rings:
 *
 *   { uuid: string, position: { lat, lng }, hasEntries: boolean }
 */

/** Great-circle distance in km — the sphere the backend measures on. */
export function distanceKm(a, b) {
  const R = 6371.0088
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// --- stub ------------------------------------------------------------------
// The scores are real: they were measured against the seed corpus. The people,
// their places and who answers what are invented — the seed only ever ran single
// searches, so it cannot show one person answering several needs. Everything
// between these two markers goes away when the route goes live.

const STUB_PEOPLE = [
  { name: 'Marta', dLat: 0.042, dLng: -0.062, scores: { angebot: [0.4056] } },
  { name: 'Ben', dLat: -0.038, dLng: -0.048, scores: { angebot: [0.536] } },
  { name: 'Kai', dLat: 0.021, dLng: 0.071, scores: { angebot: [0.5617] } },
  { name: 'Eva', dLat: -0.012, dLng: 0.083, scores: { angebot: [0.5324] } },
  { name: 'Nina', dLat: -0.031, dLng: 0.034, scores: { gesuch: [0.4239] } },
  { name: 'Miriam', dLat: 0.018, dLng: -0.086, scores: { interesse: [0.8044] } },
  { name: 'Jonas', dLat: 0.049, dLng: 0.055, scores: { interesse: [0.6688] } },
  // two channels at once — green + red mix to an orange
  { name: 'Sofia', dLat: 0.036, dLng: -0.028, scores: { angebot: [0.4949], interesse: [0.5724] } },
  // all three — the whole person, white
  {
    name: 'Otto',
    dLat: -0.008,
    dLng: 0.018,
    scores: { angebot: [0.536], gesuch: [0.4239], interesse: [0.8044] },
  },
  // two needs answered — breadth lifts this one a step
  { name: 'Lena', dLat: -0.022, dLng: -0.074, scores: { angebot: [0.4949, 0.4013] } },
  // three needs answered — breadth lifts this one to the top
  { name: 'Max', dLat: 0.009, dLng: 0.041, scores: { angebot: [0.4056, 0.4949, 0.5324] } },
  { name: 'Tom', dLat: -0.045, dLng: 0.078, scores: { angebot: [0.4013] } },
  { name: 'Anna', dLat: 0.058, dLng: -0.035, scores: { interesse: [0.5724] } },
  { name: 'Udo', dLat: -0.052, dLng: 0.012, scores: { gesuch: [0.4239] } },
]

const PRESENCE_COUNT = 240
// Roughly ±55 km by ±66 km around the centre. Wide enough that the radius has
// something to cut: packed into 25 km they would all sit inside the default
// circle, and turning the dial would show nothing happening.
const PRESENCE_SPREAD_LAT = 1.0
const PRESENCE_SPREAD_LNG = 1.8

/** Deterministic noise, so the stub does not jump around between reloads. */
function wobble(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x) - 0.5
}

function stubMatches({ center, radius }) {
  return STUB_PEOPLE.map((person, index) => ({
    uuid: `stub-match-${index}`,
    name: person.name,
    position: { lat: center.lat + person.dLat, lng: center.lng + person.dLng },
    scores: person.scores,
  })).filter((match) => distanceKm(center, match.position) <= radius)
}

function stubPresence({ center, radius }) {
  return Array.from({ length: PRESENCE_COUNT }, (_, index) => ({
    uuid: `stub-presence-${index}`,
    position: {
      lat: center.lat + wobble(index + 1) * PRESENCE_SPREAD_LAT,
      lng: center.lng + wobble(index + 101) * PRESENCE_SPREAD_LNG,
    },
    hasEntries: index % 3 !== 0,
  })).filter((person) => distanceKm(center, person.position) <= radius)
}

// --- end of stub -----------------------------------------------------------

export function useMatches() {
  const matches = ref([])
  const presence = ref([])
  const loading = ref(false)
  const error = ref(null)

  /**
   * @param {{center: {lat: number, lng: number}, radius: number}} search
   *   where the member chose to search, and how far out
   */
  async function load(search) {
    if (!search?.center || !(search.radius > 0)) return
    loading.value = true
    error.value = null
    try {
      matches.value = stubMatches(search)
      presence.value = stubPresence(search)
    } catch (err) {
      error.value = err
      matches.value = []
      presence.value = []
    } finally {
      loading.value = false
    }
  }

  return { matches, presence, loading, error, load }
}
