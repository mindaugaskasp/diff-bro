import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useFormatConfirm } from '../../../src/renderer/src/composables/useFormatConfirm'

describe('useFormatConfirm', () => {
  it('formats a new draft at once, without asking', () => {
    const run = vi.fn()
    const f = useFormatConfirm({ isSaved: ref(false), run })
    f.request()
    expect(run).toHaveBeenCalledTimes(1)
    expect(f.asking.value).toBe(false)
  })

  it('asks first on a saved snippet, and formats only on confirm', () => {
    const run = vi.fn()
    const f = useFormatConfirm({ isSaved: ref(true), run })
    f.request()
    expect(run).not.toHaveBeenCalled()
    expect(f.asking.value).toBe(true)
    f.confirm()
    expect(run).toHaveBeenCalledTimes(1)
    expect(f.asking.value).toBe(false)
  })

  it('cancel leaves the content alone', () => {
    const run = vi.fn()
    const f = useFormatConfirm({ isSaved: ref(true), run })
    f.request()
    f.cancel()
    expect(run).not.toHaveBeenCalled()
    expect(f.asking.value).toBe(false)
  })
})
