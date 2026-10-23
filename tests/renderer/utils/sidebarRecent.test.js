import { describe, expect, it } from 'vitest'
import { sidebarRecent } from '../../../src/renderer/src/utils/sidebarRecent'

const NOW = new Date(2026, 9, 23, 15, 0).getTime()
const at = (days, hour = 10) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - days)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

describe('sidebarRecent', () => {
  it('merges diffs and snippets newest first, by their last change', () => {
    const groups = sidebarRecent({
      diffs: [{ id: 'd1', name: 'api.yaml', createdAt: at(0, 9) }],
      snippets: [
        { id: 's1', name: 'old', createdAt: at(5) },
        { id: 's2', name: 'edited', createdAt: at(9), updatedAt: at(0, 11) }
      ],
      now: NOW
    })
    expect(groups[0].key).toBe('today')
    expect(groups[0].items.map((i) => i.id)).toEqual(['s2', 'd1'])
  })

  it('buckets by local day: today, yesterday, this week, earlier', () => {
    const groups = sidebarRecent({
      diffs: [0, 1, 4, 20].map((d) => ({ id: `d${d}`, name: 'x', createdAt: at(d) })),
      snippets: [],
      now: NOW
    })
    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'thisWeek', 'earlier'])
  })

  it('marks a diff someone sealed for the user as received', () => {
    const [group] = sidebarRecent({
      diffs: [{ id: 'r', name: 'notes.md', createdAt: at(0), from: 'abc' }],
      snippets: [],
      now: NOW
    })
    expect(group.items[0].kind).toBe('received')
  })

  it('stops at the limit and drops empty groups', () => {
    const snippets = Array.from({ length: 12 }, (_, n) => ({
      id: `s${n}`,
      name: 'x',
      createdAt: at(0, n)
    }))
    const groups = sidebarRecent({ diffs: [], snippets, now: NOW, limit: 5 })
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(5)
  })
})
