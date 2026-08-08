import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useLauncherFocus } from '../../../src/renderer/src/composables/useLauncherFocus'

// QuickLookSearch exposes { focus, reclaim } and nothing else — its own focus()
// already selects. Calling select() on the COMPONENT threw, and because
// focusInput() is the first statement in QuickLook.vue's onMounted, the throw
// aborted the callback before it could register the quicklook:show listener.
// The launcher therefore never re-read its library on a summon: the previous
// query, and later a whole compose draft, survived every re-open.
describe('useLauncherFocus', () => {
  const harness = (searchBand) => {
    const input = ref(searchBand)
    return useLauncherFocus({
      input,
      composeEl: ref(null),
      composing: ref(false),
      convertTool: ref(null)
    })
  }

  it('calls only what the search band actually exposes', () => {
    const band = { focus: vi.fn(), reclaim: vi.fn() }
    const { focusInput } = harness(band)
    expect(() => focusInput()).not.toThrow()
    expect(band.focus).toHaveBeenCalledTimes(1)
  })

  it('is a no-op before the band is mounted', () => {
    const { focusInput } = harness(null)
    expect(() => focusInput()).not.toThrow()
  })

  it('hands the keyboard back on a click that landed on a button', () => {
    const band = { focus: vi.fn(), reclaim: vi.fn() }
    const { reclaimKeyboard } = harness(band)
    reclaimKeyboard({ target: { closest: () => null } })
    expect(band.reclaim).toHaveBeenCalledTimes(1)
  })

  it('leaves a click inside a field alone', () => {
    const band = { focus: vi.fn(), reclaim: vi.fn() }
    const { reclaimKeyboard } = harness(band)
    reclaimKeyboard({ target: { closest: () => ({}) } })
    expect(band.reclaim).not.toHaveBeenCalled()
  })
})
