import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSidebarTags } from '../../../src/renderer/src/composables/useSidebarTags'
import { TAGS_PER_ROW } from '../../../src/renderer/src/utils/settingsDefaults'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

// A tall screen has room the default two rows do not use. The setting adds
// ROWS, never removes them: two is the floor as well as the default, so the
// sidebar can never be turned into a wall of tags with the lists squeezed out.
describe('useSidebarTags — how tall the shelf may be', () => {
  const manyTags = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, tags: [`tag-${i}`], name: `s${i}` }))

  it('shows two rows by default, unchanged', () => {
    useSnippetStore().entries = manyTags(40)
    expect(useSidebarTags().bar.value).toHaveLength(TAGS_PER_ROW * 2)
  })

  it('shows more once the reader asks for more rows', () => {
    useSnippetStore().entries = manyTags(40)
    useSettingsStore().tagShelfRows = 6
    expect(useSidebarTags().bar.value).toHaveLength(TAGS_PER_ROW * 6)
  })

  it('never shows fewer than the default, whatever it is set to', () => {
    useSnippetStore().entries = manyTags(40)
    for (const bad of [0, 1, -5, null, 'lots']) {
      useSettingsStore().tagShelfRows = bad
      expect(useSidebarTags().bar.value.length).toBeGreaterThanOrEqual(TAGS_PER_ROW * 2)
    }
  })

  it('counts what did not fit', () => {
    useSnippetStore().entries = manyTags(40)
    useSettingsStore().tagShelfRows = 4
    const tags = useSidebarTags()
    expect(tags.overflow.value).toBe(40 - TAGS_PER_ROW * 4)
  })
})

// "+1 more" costs the same slot the one hidden tag would fill — a chip that
// says "there is one more" where the one more could simply BE is a puzzle.
describe('useSidebarTags — the last-slot rule', () => {
  const manyTags = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, tags: [`tag-${i}`], name: `s${i}` }))

  it('one tag over the limit shows the tag itself, not "+1 more"', () => {
    useSnippetStore().entries = manyTags(TAGS_PER_ROW * 2 + 1)
    const tags = useSidebarTags()
    expect(tags.bar.value).toHaveLength(TAGS_PER_ROW * 2 + 1)
    expect(tags.overflow.value).toBe(0)
  })

  it('two tags over still collapses — the chip now earns its slot', () => {
    useSnippetStore().entries = manyTags(TAGS_PER_ROW * 2 + 2)
    const tags = useSidebarTags()
    expect(tags.bar.value).toHaveLength(TAGS_PER_ROW * 2)
    expect(tags.overflow.value).toBe(2)
  })
})

// The picker exists for what the shelf could not show — feeding it every tag
// made "+5 more" open a wall of 40, with the five it promised lost inside.
describe('useSidebarTags — what the picker holds', () => {
  const manyTags = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, tags: [`tag-${i}`], name: `s${i}` }))

  it('hidden is exactly the overflow — the bar and it partition the registry', () => {
    useSnippetStore().entries = manyTags(12)
    const tags = useSidebarTags()
    expect(tags.hidden.value).toHaveLength(tags.overflow.value)
    const shown = new Set(tags.bar.value.map((t) => t.name))
    for (const t of tags.hidden.value) expect(shown.has(t.name)).toBe(false)
    expect(tags.bar.value.length + tags.hidden.value.length).toBe(tags.all.value.length)
  })

  it('a selected tag is never hidden, however low it ranks', () => {
    useSnippetStore().entries = manyTags(12)
    const tags = useSidebarTags()
    tags.pick('tag-11')
    expect(tags.hidden.value.map((t) => t.name)).not.toContain('tag-11')
  })
})
