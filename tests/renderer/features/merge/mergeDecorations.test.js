import { describe, expect, it } from 'vitest'
import {
  regionOptions,
  rulerColors,
  sideDecorations
} from '../../../../src/renderer/src/features/merge/mergeDecorations'

const COLORS = { open: '#c80', done: '#0a0', ours: '#b42', theirs: '#0a0' }

describe('regionOptions', () => {
  it('marks the region being worked on, and the ones already settled', () => {
    expect(regionOptions({ resolved: false }, true, COLORS).className).toContain('current')
    expect(regionOptions({ resolved: true }, false, COLORS).className).toContain('resolved')
    expect(regionOptions({ resolved: false }, false, COLORS).className).toBe('merge-region')
  })

  // In a long file the scrollbar is the only place the conflicts you have not
  // reached are visible at all.
  it('puts every region in the scrollbar, coloured by whether it is settled', () => {
    expect(regionOptions({ resolved: false }, false, COLORS).overviewRuler.color).toBe(COLORS.open)
    expect(regionOptions({ resolved: true }, false, COLORS).overviewRuler.color).toBe(COLORS.done)
  })
})

describe('sideDecorations', () => {
  const regions = [{ ours: ['replicas: 5'], theirs: ['replicas: 9'] }]

  it('bands the region and hangs the chevron in the glyph margin', () => {
    const [band] = sideDecorations([{ line: 4, count: 1 }], regions, 'ours', COLORS)
    expect(band.range.startLineNumber).toBe(4)
    expect(band.options.glyphMarginClassName).toContain('merge-take-ours')
    // Its own colour, not the middle pane's: that one is about state.
    expect(band.options.className).toBe('merge-side-ours')
    expect(band.options.overviewRuler.color).toBe(COLORS.ours)
  })

  it('tints only the columns that differ, at the side pane’s own line numbers', () => {
    const decorations = sideDecorations([{ line: 4, count: 1 }], regions, 'theirs', COLORS)
    const word = decorations.find((d) => d.options.className?.includes('merge-word'))
    expect(word.options.className).toContain('merge-word-theirs')
    expect(word.range).toMatchObject({ startLineNumber: 4, startColumn: 11, endColumn: 12 })
  })

  it('draws nothing for a region the side does not contain', () => {
    expect(sideDecorations([null], regions, 'ours', COLORS)).toEqual([])
  })
})

// jsdom resolves no custom property, so this exercises the fallback — which is
// the branch that matters: a ruler with no colour paints nothing at all.
describe('rulerColors', () => {
  it('always answers with four colours, whatever the document resolves', () => {
    const colors = rulerColors()
    for (const key of ['open', 'done', 'ours', 'theirs']) {
      expect(colors[key], key).toMatch(/\S/)
    }
    expect(document.querySelectorAll('span')).toHaveLength(0)
  })
})
