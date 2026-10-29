import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useTagSections } from '../../../src/renderer/src/composables/useTagSections'

beforeEach(() => localStorage.clear())

describe('useTagSections', () => {
  it('starts every section open, so a new tag is never hidden', () => {
    expect(useTagSections('snippets').isOpen('ops/k8s')).toBe(true)
  })

  it('remembers a closed section across a relaunch', () => {
    useTagSections('snippets').toggle('ops')
    const again = useTagSections('snippets')
    expect(again.isOpen('ops')).toBe(false)
    again.toggle('ops')
    expect(useTagSections('snippets').isOpen('ops')).toBe(true)
  })

  it('opens everything while searching, without forgetting what was closed', () => {
    const searching = ref(false)
    const sections = useTagSections('snippets', searching)
    sections.toggle('data')
    searching.value = true
    expect(sections.isOpen('data')).toBe(true)
    searching.value = false
    expect(sections.isOpen('data')).toBe(false)
  })

  it('keeps Snippets and Diffs apart', () => {
    useTagSections('snippets').toggle('ops')
    expect(useTagSections('diffs').isOpen('ops')).toBe(true)
  })
})
