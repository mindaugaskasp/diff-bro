// The demo data drives `make local-seed` and the screenshot flow, so a fixture
// the app cannot render is a bug that ships in every screenshot. These assert
// the seed against the REAL adapter registry rather than against itself: a side
// is only good if resolveAdapter() picks the format it claims to be.
import { describe, expect, it } from 'vitest'
import { savedDiffs, externalDiffs } from '../../scripts/lib/seedData.mjs'
import { resolveAdapter } from '../../src/renderer/src/adapters/index.js'

const NOW = Date.UTC(2026, 6, 1)
const allEntries = () => [...savedDiffs(NOW), ...externalDiffs(NOW)]
const sidesOf = (entry) => [entry.payload.left, entry.payload.right]
const byName = (name) => allEntries().find((e) => e.name === name)

describe('seeded diffs render as the format their filename claims', () => {
  it('has a workbook entry to check', () => {
    expect(byName('Q3 budget workbook')).toBeTruthy()
  })

  // The reported bug: the saved workbook opened as one line of text reading
  // "(spreadsheet)" on both sides, so the grid never appeared and the app
  // correctly reported "No differences — both sides are identical".
  it('opens the .xlsx pair as a grid, not as text', () => {
    for (const side of sidesOf(byName('Q3 budget workbook'))) {
      expect(side.name).toMatch(/\.xlsx$/)
      expect(resolveAdapter(side).id).toBe('xlsx')
      expect(resolveAdapter(side).toComparable(side).sheets.length).toBeGreaterThan(0)
    }
  })

  it('gives the workbook two sides that actually differ', () => {
    const [left, right] = sidesOf(byName('Q3 budget workbook'))
    const adapter = resolveAdapter(left)
    expect(adapter.sameContent(adapter.toComparable(left), adapter.toComparable(right))).toBe(false)
  })

  // The general rule the bug broke: a seeded side is real content, never a
  // stand-in describing what should have been there.
  it('never stands a placeholder in for real content', () => {
    for (const entry of allEntries()) {
      for (const side of sidesOf(entry)) {
        expect(side.content ?? '').not.toMatch(/^\((spreadsheet|xlsx|binary|image)\)$/i)
      }
    }
  })

  it('every seeded side resolves to an adapter that can read it', () => {
    for (const entry of allEntries()) {
      for (const side of sidesOf(entry)) {
        const adapter = resolveAdapter(side)
        expect(adapter.id).toBeTruthy()
        if (adapter.id === 'text') expect(typeof side.content).toBe('string')
        if (adapter.id === 'xlsx') expect(Array.isArray(side.sheets)).toBe(true)
      }
    }
  })
})
