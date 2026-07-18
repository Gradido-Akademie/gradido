/**
 * Glow map — display core.
 *
 * Pure functions turning a match score into what the eye sees. No DOM, no Vue.
 *
 * Two things stay apart on purpose: the score is continuous (it sorts), while the
 * display snaps to four discrete steps (the eye cannot separate more than that on
 * a glow field). The snapping happens here, at the edge, so ranking loses nothing.
 *
 * The numbers below are calibrated against the seed corpus and confirmed by eye on
 * the living glow field. Do not tune them without re-running that check.
 */

export const CHANNELS = ['interesse', 'angebot', 'gesuch']

/**
 * Canonical peak colours. The mix is additive and means the same in every map
 * appearance: red + green = yellow, all three = white (the whole person).
 * Green sits at 204 and blue is lifted to 70/90 so the channels read equally
 * bright to the eye.
 */
export const CANON = {
  interesse: [255, 0, 0],
  angebot: [0, 204, 0],
  gesuch: [70, 90, 255],
  ganz: [255, 255, 255],
}

/**
 * Label colours — for the filter legend swatches and the profile dots, NOT the
 * glow markers. Red and blue stay the vibrant glow primaries: they were never
 * the problem, and Bernd likes them strong. Only the green is pulled towards
 * emerald — a touch of blue in it — so it parts clearly from the red for
 * red-green colour vision, which cannot tell pure red from pure green apart.
 * The markers keep CANON, because only clean R/G/B primaries mix additively
 * (red + green = yellow). Chosen by eye against both a dark and a light ground.
 */
export const LABEL_COLORS = {
  interesse: '#ff0000',
  angebot: '#10b981',
  gesuch: '#4658ff',
}

export const DEFAULTS = {
  // Below the cut a person shows as a grey presence ring, not as a match.
  cut: 0.17,
  // The three thresholds splitting the four steps.
  thresholds: [0.4, 0.52, 0.62],
  // Share of the peak colour per step. Step 1 starts high because anything
  // below roughly 0.3 is invisible against a dark ground.
  stageBright: [0.46, 0.64, 0.82, 1.0],
}

/** Score → step 0..4. Step 0 means "below the cut": no glow. */
export function scoreToStage(score, cfg = DEFAULTS) {
  const [t1, t2, t3] = cfg.thresholds
  if (score < cfg.cut) return 0
  if (score < t1) return 1
  if (score < t2) return 2
  if (score < t3) return 3
  return 4
}

/**
 * Breadth amplifier: +1 step per additional need answered, counting only needs
 * that reach step 2. A step-1 flicker does not count — otherwise someone who
 * barely grazes four needs would glow as bright as a perfect single match.
 */
export function applyBreite(baseStage, extraNeeds) {
  if (baseStage < 1) return 0
  return Math.min(4, baseStage + Math.max(0, extraNeeds))
}

export function stageBrightness(stage, cfg = DEFAULTS) {
  return stage <= 0 ? 0 : cfg.stageBright[stage - 1]
}

/**
 * One channel of one person → its step.
 *
 * `scores` holds one score per *own* entry this person answers on this channel.
 * The base is the best of them; breadth lifts it from there.
 */
export function channelStage(scores, cfg = DEFAULTS, breiteOn = false) {
  if (!scores || !scores.length) return 0
  const stages = scores.map((score) => scoreToStage(score, cfg))
  const base = Math.max(...stages)
  if (base < 1) return 0
  const atTwoPlus = stages.filter((stage) => stage >= 2).length
  return applyBreite(base, breiteOn ? Math.max(0, atTwoPlus - 1) : 0)
}

/** Steps per channel → the marker's colour, mixed additively. */
export function markerColor(channelStages, cfg = DEFAULTS) {
  let r = 0
  let g = 0
  let b = 0
  for (const channel of CHANNELS) {
    const stage = channelStages[channel] || 0
    if (stage > 0) {
      const share = stageBrightness(stage, cfg)
      r += CANON[channel][0] * share
      g += CANON[channel][1] * share
      b += CANON[channel][2] * share
    }
  }
  return [Math.min(255, Math.round(r)), Math.min(255, Math.round(g)), Math.min(255, Math.round(b))]
}

/** The strongest channel — drives the marker's size. */
export function peakStage(channelStages) {
  return Math.max(
    channelStages.interesse || 0,
    channelStages.angebot || 0,
    channelStages.gesuch || 0,
  )
}

/** Steps per channel for one person, honouring the channel filter. */
export function stagesOf(match, cfg = DEFAULTS, breiteOn = false, visible = null) {
  const stages = {}
  for (const channel of CHANNELS) {
    stages[channel] =
      visible && !visible[channel] ? 0 : channelStage(match.scores?.[channel], cfg, breiteOn)
  }
  return stages
}
