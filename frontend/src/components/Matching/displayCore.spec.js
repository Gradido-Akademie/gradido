import { describe, it, expect } from 'vitest'
import {
  CANON,
  DEFAULTS,
  applyBreite,
  channelStage,
  markerColor,
  peakStage,
  scoreToStage,
  stagesOf,
} from './displayCore'

// These tests pin the calibration. They are not here to prove the arithmetic —
// they are here so a later tweak to a threshold fails loudly instead of quietly
// changing what every user sees on the map.
describe('displayCore', () => {
  describe('scoreToStage', () => {
    it('leaves anything below the cut dark', () => {
      expect(scoreToStage(0.16, DEFAULTS)).toBe(0)
    })

    it('starts glowing at the cut', () => {
      expect(scoreToStage(0.17, DEFAULTS)).toBe(1)
    })

    it('splits the four steps at 0.40 / 0.52 / 0.62', () => {
      expect(scoreToStage(0.399, DEFAULTS)).toBe(1)
      expect(scoreToStage(0.4, DEFAULTS)).toBe(2)
      expect(scoreToStage(0.52, DEFAULTS)).toBe(3)
      expect(scoreToStage(0.62, DEFAULTS)).toBe(4)
    })

    it('gives an outstanding single match the full glow', () => {
      expect(scoreToStage(0.8903, DEFAULTS)).toBe(4)
    })
  })

  describe('applyBreite', () => {
    it('lifts one step per additional need', () => {
      expect(applyBreite(2, 1)).toBe(3)
      expect(applyBreite(2, 2)).toBe(4)
    })

    it('caps at the top step', () => {
      expect(applyBreite(3, 5)).toBe(4)
    })

    it('never lifts someone who is below the cut', () => {
      expect(applyBreite(0, 3)).toBe(0)
    })
  })

  describe('channelStage', () => {
    it('takes the best match as the base', () => {
      expect(channelStage([0.2, 0.55], DEFAULTS, false)).toBe(3)
    })

    it('lets breadth lift three middling needs to the top', () => {
      expect(channelStage([0.41, 0.45, 0.49], DEFAULTS, true)).toBe(4)
    })

    it('leaves them at their base when breadth is off', () => {
      expect(channelStage([0.41, 0.45, 0.49], DEFAULTS, false)).toBe(2)
    })

    it('does not let a step-1 flicker count as breadth', () => {
      expect(channelStage([0.2, 0.19], DEFAULTS, true)).toBe(1)
    })

    it('leaves a perfect single match at the top rather than overflowing', () => {
      expect(channelStage([0.89], DEFAULTS, true)).toBe(4)
    })

    it('treats no scores as no match', () => {
      expect(channelStage([], DEFAULTS, true)).toBe(0)
      expect(channelStage(undefined, DEFAULTS, true)).toBe(0)
    })
  })

  describe('markerColor', () => {
    it('shows a single channel in its own colour', () => {
      expect(markerColor({ angebot: 4 }, DEFAULTS)).toEqual(CANON.angebot)
    })

    it('mixes two channels additively into a second colour', () => {
      expect(markerColor({ interesse: 4, angebot: 4 }, DEFAULTS)).toEqual([255, 204, 0])
    })

    it('turns the whole person white', () => {
      expect(markerColor({ interesse: 4, angebot: 4, gesuch: 4 }, DEFAULTS)).toEqual(CANON.ganz)
    })

    it('dims a weaker step without changing its hue', () => {
      const [r, g, b] = markerColor({ angebot: 1 }, DEFAULTS)
      expect(r).toBe(0)
      expect(b).toBe(0)
      expect(g).toBeGreaterThan(0)
      expect(g).toBeLessThan(CANON.angebot[1])
    })

    it('shows nothing when no channel matches', () => {
      expect(markerColor({}, DEFAULTS)).toEqual([0, 0, 0])
    })
  })

  describe('peakStage', () => {
    it('follows the strongest channel', () => {
      expect(peakStage({ interesse: 1, angebot: 3, gesuch: 2 })).toBe(3)
      expect(peakStage({})).toBe(0)
    })
  })

  describe('stagesOf', () => {
    const match = { scores: { angebot: [0.55], interesse: [0.2] } }

    it('reads every channel of a person', () => {
      expect(stagesOf(match, DEFAULTS, false)).toEqual({ interesse: 1, angebot: 3, gesuch: 0 })
    })

    it('drops a channel the filter hides', () => {
      const visible = { interesse: false, angebot: true, gesuch: true }
      expect(stagesOf(match, DEFAULTS, false, visible)).toEqual({
        interesse: 0,
        angebot: 3,
        gesuch: 0,
      })
    })
  })
})
