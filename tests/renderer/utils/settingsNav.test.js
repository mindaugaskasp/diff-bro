import { describe, it, expect } from 'vitest'
import {
  settingsGroups,
  groupOfPage,
  navForPage,
  navAfterGroupClick
} from '../../../src/renderer/src/utils/settingsNav'

const pageIds = (groups) => groups.flatMap((g) => g.pages.map((p) => p.id))

describe('settingsGroups', () => {
  it('holds General, Integrations and Data in that order', () => {
    expect(settingsGroups({ windows: false }).map((g) => g.id)).toEqual([
      'general',
      'integrations',
      'data'
    ])
  })

  it('holds every page once', () => {
    const ids = pageIds(settingsGroups({ windows: true }))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([
      'appearance',
      'behaviour',
      'tours',
      'shortcuts',
      'desktop',
      'languages',
      'claude',
      'cli',
      'email',
      'storage',
      'limits',
      'logs'
    ])
  })

  it('shows Desktop only on Windows', () => {
    expect(pageIds(settingsGroups({ windows: true }))).toContain('desktop')
    expect(pageIds(settingsGroups({ windows: false }))).not.toContain('desktop')
  })

  it('gives every group and page a catalogue key', () => {
    const groups = settingsGroups({ windows: true })
    expect(groups.flatMap((g) => g.pages)).toHaveLength(12)
    for (const group of groups) {
      expect(group.labelKey).toBe(`settingsDialog.group.${group.id}`)
      for (const page of group.pages) expect(page.labelKey).toMatch(/^settingsDialog\.tab\./)
    }
  })

  it('no longer has a Fun or a combined Integrations page', () => {
    const ids = pageIds(settingsGroups({ windows: true }))
    expect(ids).toContain('appearance')
    expect(ids).not.toContain('fun')
    expect(ids).not.toContain('integrations')
  })
})

describe('groupOfPage', () => {
  const groups = settingsGroups({ windows: false })

  it('names the group a page sits in', () => {
    expect(groupOfPage(groups, 'behaviour')).toBe('general')
    expect(groupOfPage(groups, 'tours')).toBe('general')
    expect(groupOfPage(groups, 'cli')).toBe('integrations')
    expect(groupOfPage(groups, 'logs')).toBe('data')
  })

  it('is null for a page that does not exist here', () => {
    expect(groupOfPage(groups, 'appearance')).toBe('general')
    expect(groupOfPage(groups, 'desktop')).toBeNull()
    expect(groupOfPage(groups, 'nope')).toBeNull()
  })
})

describe('navForPage', () => {
  const groups = settingsGroups({ windows: false })

  it('opening a page opens its group', () => {
    expect(navForPage(groups, 'cli')).toEqual({ page: 'cli', open: 'integrations' })
    expect(navForPage(groups, 'storage')).toEqual({ page: 'storage', open: 'data' })
    expect(navForPage(groups, 'tours')).toEqual({ page: 'tours', open: 'general' })
  })

  it('falls back to Appearance for no page or an unknown one', () => {
    const appearance = { page: 'appearance', open: 'general' }
    expect(navForPage(groups, null)).toEqual(appearance)
    expect(navForPage(groups, 'fun')).toEqual(appearance)
    expect(navForPage(groups, 'desktop')).toEqual(appearance)
  })
})

describe('navAfterGroupClick', () => {
  const groups = settingsGroups({ windows: false })
  const onAppearance = { page: 'appearance', open: 'general' }

  it('a folded group opens on its first page', () => {
    expect(navAfterGroupClick(groups, onAppearance, 'integrations')).toEqual({
      page: 'languages',
      open: 'integrations'
    })
    expect(navAfterGroupClick(groups, onAppearance, 'data')).toEqual({
      page: 'storage',
      open: 'data'
    })
  })

  it('the open group folds and keeps the page', () => {
    expect(navAfterGroupClick(groups, onAppearance, 'general')).toEqual({
      page: 'appearance',
      open: null
    })
  })

  it('reopening the folded group of the active page keeps that page', () => {
    const folded = { page: 'shortcuts', open: null }
    expect(navAfterGroupClick(groups, folded, 'general')).toEqual({
      page: 'shortcuts',
      open: 'general'
    })
  })

  it('ignores an unknown group', () => {
    expect(navAfterGroupClick(groups, onAppearance, 'data').open).toBe('data')
    expect(navAfterGroupClick(groups, onAppearance, 'nope')).toEqual(onAppearance)
  })
})
