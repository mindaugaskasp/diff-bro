import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useTagShelf } from '../../../src/renderer/src/composables/useTagShelf'

// The shelf fills its dragged height with as many chips as MEASURE says fit, so
// "+N more" is exact whatever the tag names are. jsdom has no layout, so the box
// is faked: it reports the widths the test names and re-reads whatever the shelf
// currently shows, the way a rendered one would.

const CHIP_H = 22
const STEP = CHIP_H + 4
const rowsHigh = (n) => n * STEP - 4

function harness({ names, width = 60, widths = {}, available = 200, height = rowsHigh(2) }) {
  const all = ref(names.map((name) => ({ name })))
  const active = ref([])
  const depth = ref(height)
  // The fake box re-reads whatever the shelf currently shows, the way a rendered
  // one would; `view` is the handle it needs before useTagShelf has returned.
  const view = {}
  const chip = (name) => ({
    dataset: { tag: name },
    offsetHeight: CHIP_H,
    getBoundingClientRect: () => ({ width: widths[name] ?? width })
  })
  const el = ref({
    clientWidth: available,
    scrollHeight: rowsHigh(Math.ceil(names.length / 3)),
    querySelectorAll: () => view.shelf.bar.value.map((t) => chip(t.name)),
    querySelector: (sel) =>
      sel === '.usb-more' && view.shelf.overflow.value > 0
        ? { getBoundingClientRect: () => ({ width: 60 }) }
        : null
  })
  view.shelf = useTagShelf(el, { all, active, height: depth })
  return { shelf: view.shelf, all, active, depth }
}

const settle = async () => {
  await nextTick()
  await nextTick()
}

describe('useTagShelf', () => {
  it('shows every tag when they all fit, with nothing left for the picker', async () => {
    const { shelf } = harness({ names: ['a', 'b', 'c'] })
    await settle()
    expect(shelf.bar.value).toHaveLength(3)
    expect(shelf.overflow.value).toBe(0)
    expect(shelf.hidden.value).toEqual([])
  })

  it('cuts to what fits, and hidden is exactly the rest', async () => {
    const names = Array.from({ length: 20 }, (_, i) => `tag-${i}`)
    const { shelf } = harness({ names })
    await settle()

    expect(shelf.bar.value.length).toBeLessThan(20)
    expect(shelf.bar.value.length + shelf.hidden.value.length).toBe(20)
    expect(shelf.overflow.value).toBe(shelf.hidden.value.length)
    const shown = new Set(shelf.bar.value.map((t) => t.name))
    for (const t of shelf.hidden.value) expect(shown.has(t.name)).toBe(false)
  })

  it('deepening the shelf shows more of the same tags', async () => {
    const names = Array.from({ length: 30 }, (_, i) => `tag-${i}`)
    const { shelf, depth } = harness({ names, height: rowsHigh(1) })
    await settle()
    const shallow = shelf.bar.value.length

    depth.value = rowsHigh(4)
    await settle()
    expect(shelf.bar.value.length).toBeGreaterThan(shallow)
  })

  // The point of measuring: the same depth is worth fewer chips when the names
  // are long, which a fixed chips-per-row could never express.
  it('fits fewer long names than short ones at the same depth', async () => {
    const names = Array.from({ length: 12 }, (_, i) => `tag-${i}`)
    const short = harness({ names, width: 40 })
    const long = harness({ names, width: 150 })
    await settle()
    expect(long.shelf.bar.value.length).toBeLessThan(short.shelf.bar.value.length)
  })

  it('never cuts a tag that is filtering, however low it ranks', async () => {
    const names = Array.from({ length: 30 }, (_, i) => `tag-${i}`)
    const { shelf, active } = harness({ names, height: rowsHigh(1) })
    await settle()

    active.value = ['tag-29']
    await settle()
    expect(shelf.bar.value.map((t) => t.name)).toContain('tag-29')
    expect(shelf.hidden.value.map((t) => t.name)).not.toContain('tag-29')
  })

  // The box CLIPS, so a chip the capacity cannot pay for must go to the picker
  // rather than be rendered outside the edge: shown-but-invisible chips were
  // also counted as shown, which kept them out of "+N more" — a filter you could
  // neither see nor switch off.
  it('sends selected tags that do not fit to the picker, not off the edge', async () => {
    const names = Array.from({ length: 30 }, (_, i) => `tag-${i}`)
    const { shelf, active } = harness({ names, height: rowsHigh(1), width: 150 })
    await settle()

    active.value = ['tag-27', 'tag-28', 'tag-29', 'tag-26']
    await settle()

    const shown = shelf.bar.value.map((t) => t.name)
    const away = shelf.hidden.value.map((t) => t.name)
    expect(shown.length).toBeLessThan(4)
    // Every selected tag is reachable: on the shelf, or in what "+N more" opens.
    for (const name of active.value) expect(shown.includes(name) || away.includes(name)).toBe(true)
    expect(shelf.bar.value.length + shelf.hidden.value.length).toBe(30)
    expect(shelf.overflow.value).toBe(shelf.hidden.value.length)
  })

  it('re-measures when the tag set changes', async () => {
    const { shelf, all } = harness({ names: ['a', 'b'] })
    await settle()
    expect(shelf.overflow.value).toBe(0)

    all.value = Array.from({ length: 40 }, (_, i) => ({ name: `tag-${i}` }))
    await settle()
    expect(shelf.overflow.value).toBeGreaterThan(0)
  })

  it('reports what showing every tag would take, for the double-click snap', async () => {
    const names = Array.from({ length: 12 }, (_, i) => `tag-${i}`)
    const { shelf } = harness({ names })
    await settle()
    expect(shelf.fullHeight.value).toBe(rowsHigh(4))
  })

  it('holds still when there is no box to measure', async () => {
    const all = ref([{ name: 'a' }])
    const shelf = useTagShelf(ref(null), { all, active: ref([]), height: ref(48) })
    await settle()
    expect(shelf.bar.value).toHaveLength(1)
    expect(shelf.overflow.value).toBe(0)
  })
})
