import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useRecipientPicker } from '../../../src/renderer/src/composables/useRecipientPicker'

const keys = [
  { fingerprint: 'fp-ana', label: 'Ana — work laptop', email: 'ana@example.com' },
  { fingerprint: 'fp-ruta', label: 'Rūta — design', email: 'ruta@example.com' },
  { fingerprint: 'fp-tomas', label: 'Tomas — build box', email: 'tomas@example.com' },
  { fingerprint: 'fp-ci', label: 'Automation — CI signer', email: null }
]

const setup = (list = keys, opts) => useRecipientPicker(ref([...list]), opts)
const key = (k) => ({ key: k })

describe('a filter may never hide a selection', () => {
  // This is the regression the whole two-region design exists to prevent: tick
  // Ana, type "tom", and Ana must still be selected and still rendered.
  it('keeps a selection made before a query that excludes it', () => {
    const p = setup()
    p.toggle('fp-ana')
    p.setQuery('tom')

    expect(p.visible.value.map((r) => r.fingerprint)).not.toContain('fp-ana')
    expect(p.selected.value).toEqual(['fp-ana'])
    expect(p.picked.value.map((r) => r.label)).toEqual(['Ana — work laptop'])
  })

  it('submits the selection, not the visible rows', () => {
    const p = setup()
    p.toggle('fp-ana')
    p.setQuery('tom')
    p.toggle('fp-tomas')

    expect(p.picked.value.map((r) => r.fingerprint).sort()).toEqual(['fp-ana', 'fp-tomas'])
  })

  it('clearing the query restores the full list with the selection intact', () => {
    const p = setup()
    p.toggle('fp-ana')
    p.setQuery('tom')
    p.setQuery('')
    expect(p.visible.value).toHaveLength(4)
    expect(p.selected.value).toEqual(['fp-ana'])
  })

  it('a selection survives the with-an-address filter excluding it', () => {
    const p = setup()
    p.toggle('fp-ci')
    p.emailOnly.value = true
    expect(p.visible.value.map((r) => r.fingerprint)).not.toContain('fp-ci')
    expect(p.picked.value.map((r) => r.fingerprint)).toEqual(['fp-ci'])
  })
})

describe('toggle', () => {
  it('adds then removes', () => {
    const p = setup()
    p.toggle('fp-ana')
    expect(p.selected.value).toEqual(['fp-ana'])
    p.toggle('fp-ana')
    expect(p.selected.value).toEqual([])
  })

  it('ignores a missing fingerprint', () => {
    const p = setup()
    p.toggle(undefined)
    expect(p.selected.value).toEqual([])
  })
})

describe('reconcile', () => {
  it('drops a selection whose key was removed while the dialog was open', () => {
    const list = ref([...keys])
    const p = useRecipientPicker(list)
    p.toggle('fp-ana')
    list.value = keys.filter((k) => k.fingerprint !== 'fp-ana')
    p.reconcile()
    expect(p.selected.value).toEqual([])
  })

  it('pre-ticks the key just added, since that is the one you went to fetch', () => {
    const p = setup()
    p.reconcile('fp-tomas')
    expect(p.selected.value).toEqual(['fp-tomas'])
  })

  it('pre-ticks the only key when there is exactly one', () => {
    const p = setup([keys[0]])
    p.reconcile()
    expect(p.selected.value).toEqual(['fp-ana'])
  })

  it('does not pre-tick when there are several', () => {
    const p = setup()
    p.reconcile()
    expect(p.selected.value).toEqual([])
  })
})

describe('keyboard', () => {
  it('ArrowDown and ArrowUp move through the FILTERED list and wrap', () => {
    const p = setup()
    p.setQuery('tom')
    expect(p.visible.value).toHaveLength(2) // Tomas (label), Automation (substring)
    expect(p.activeIndex.value).toBe(0)

    expect(p.handleKey(key('ArrowDown'))).toBe(true)
    expect(p.activeIndex.value).toBe(1)
    p.handleKey(key('ArrowDown'))
    expect(p.activeIndex.value).toBe(0) // wrapped
    p.handleKey(key('ArrowUp'))
    expect(p.activeIndex.value).toBe(1) // wrapped back
  })

  it('Space toggles the active row when the field is empty', () => {
    const p = setup()
    expect(p.handleKey(key(' '))).toBe(true)
    expect(p.selected.value).toEqual([p.visible.value[0].fingerprint])
  })

  // The regression: Space was consumed whenever any row was visible, so a label
  // with a space could not be searched AND the keypress silently ticked whoever
  // was active — in the one control whose job is choosing who gets the file.
  it('leaves Space to the field while a query is being typed', () => {
    const p = setup()
    p.setQuery('Ana')
    expect(p.handleKey(key(' '))).toBe(false)
    expect(p.selected.value).toEqual([])
  })

  it('Space does nothing when the filter matched nothing', () => {
    const p = setup()
    p.setQuery('zzzz')
    expect(p.handleKey(key(' '))).toBe(false)
    expect(p.selected.value).toEqual([])
  })

  it('Enter submits only when something is picked', () => {
    const p = setup()
    let submitted = 0
    expect(p.handleKey(key('Enter'), { onSubmit: () => (submitted += 1) })).toBe(false)
    expect(submitted).toBe(0)

    p.toggle('fp-ana')
    expect(p.handleKey(key('Enter'), { onSubmit: () => (submitted += 1) })).toBe(true)
    expect(submitted).toBe(1)
  })

  // Two-stage: a filtered list is a state you want out of before you want out
  // of the dialog.
  it('Escape clears a non-empty query first, and only then closes', () => {
    const p = setup()
    let closed = 0
    p.setQuery('tom')

    expect(p.handleKey(key('Escape'), { onClose: () => (closed += 1) })).toBe(true)
    expect(p.query.value).toBe('')
    expect(closed).toBe(0)

    expect(p.handleKey(key('Escape'), { onClose: () => (closed += 1) })).toBe(true)
    expect(closed).toBe(1)
  })

  it('leaves other keys to the field, so typing still works', () => {
    const p = setup()
    expect(p.handleKey(key('a'))).toBe(false)
    expect(p.handleKey(key('Backspace'))).toBe(false)
  })

  it('resets the active row when the query changes', () => {
    const p = setup()
    p.handleKey(key('ArrowDown'))
    expect(p.activeIndex.value).toBe(1)
    p.setQuery('tom')
    expect(p.activeIndex.value).toBe(0)
  })
})

describe('derived state', () => {
  it('reports whether the list is filtered', () => {
    const p = setup()
    expect(p.isFiltered.value).toBe(false)
    p.setQuery('tom')
    expect(p.isFiltered.value).toBe(true)
    expect(p.total.value).toBe(4)
  })

  it('everyPickedHasEmail is false when a pick has none', () => {
    const p = setup()
    p.toggle('fp-ana')
    expect(p.everyPickedHasEmail.value).toBe(true)
    p.toggle('fp-ci')
    expect(p.everyPickedHasEmail.value).toBe(false)
  })

  it('everyPickedHasEmail is false with nothing picked, so Email is not offered', () => {
    expect(setup().everyPickedHasEmail.value).toBe(false)
  })
})
