import { describe, expect, it } from 'vitest'
import { structureAdapter } from '../../../src/renderer/src/adapters/structureAdapter'

// Four of the five adapters had a test; this one did not, and it is the seam the
// whole structural comparison hangs on. Changing `matches` to `() => true` or
// letting a parse error through as a value both left the suite green.
describe('structureAdapter', () => {
  describe('matches', () => {
    it('needs a structured kind AND string content', () => {
      expect(structureAdapter.matches({ content: '{}' }, 'json')).toBe(true)
      // No kind: a plain text file must not be dragged into the tree view.
      expect(structureAdapter.matches({ content: '{}' }, null)).toBe(false)
      expect(structureAdapter.matches({ content: '{}' }, undefined)).toBe(false)
      expect(structureAdapter.matches({ content: '{}' }, '')).toBe(false)
    })

    it('refuses a side with no readable content', () => {
      // A streamed side carries no `content`, and an xlsx carries a workbook.
      expect(structureAdapter.matches({}, 'json')).toBe(false)
      expect(structureAdapter.matches({ content: null }, 'json')).toBe(false)
      expect(structureAdapter.matches({ content: { rows: [] } }, 'json')).toBe(false)
      expect(structureAdapter.matches(null, 'json')).toBe(false)
      expect(structureAdapter.matches(undefined, 'json')).toBe(false)
    })
  })

  describe('toComparable', () => {
    it('returns a tree comparable carrying the parsed value', () => {
      const out = structureAdapter.toComparable({ content: '{"a":1}' }, 'json')
      expect(out.kind).toBe('tree')
      expect(out.value).toEqual({ a: 1 })
      expect(out.error).toBeUndefined()
    })

    it('parses yaml and xml through the same seam', () => {
      expect(structureAdapter.toComparable({ content: 'a: 1' }, 'yaml').value).toEqual({ a: 1 })
      const xml = structureAdapter.toComparable({ content: '<r><a>1</a></r>' }, 'xml')
      expect(xml.kind).toBe('tree')
      expect(xml.error).toBeUndefined()
    })

    // The error has to travel as an error, not as a value: a half-parsed side
    // reaching diffStructures compares `undefined` against real data.
    it('passes a parse failure through as an error, never as a value', () => {
      const out = structureAdapter.toComparable({ content: '{not json' }, 'json')
      expect(out.kind).toBe('tree')
      expect(out.error).toBeTruthy()
      expect(out.value).toBeUndefined()
    })
  })
})
