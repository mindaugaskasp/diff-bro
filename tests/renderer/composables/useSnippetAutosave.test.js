import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import {
  useSnippetAutosave,
  AUTOSAVE_MS
} from '../../../src/renderer/src/composables/useSnippetAutosave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup({ isNew = false, dirty = true, editing = true, canSave = true } = {}) {
  const state = {
    isNew: ref(isNew),
    isDirty: ref(dirty),
    editMode: ref(editing),
    canSave: ref(canSave)
  }
  const save = vi.fn()
  const scope = effectScope()
  scope.run(() => useSnippetAutosave({ ...state, save }))
  return { state, save, scope }
}

describe('useSnippetAutosave', () => {
  it('saves a saved snippet with changes every five seconds', () => {
    const { save } = setup()
    expect(AUTOSAVE_MS).toBe(5000)
    vi.advanceTimersByTime(4999)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('never saves a new, unsaved snippet', () => {
    const { save } = setup({ isNew: true })
    vi.advanceTimersByTime(20000)
    expect(save).not.toHaveBeenCalled()
  })

  it('skips a tick with nothing to save, out of edit mode, or while a save cannot run', () => {
    for (const opts of [{ dirty: false }, { editing: false }, { canSave: false }]) {
      const { save } = setup(opts)
      vi.advanceTimersByTime(10000)
      expect(save).not.toHaveBeenCalled()
    }
  })

  it('stops when its owner goes away', () => {
    const { save, scope } = setup()
    scope.stop()
    vi.advanceTimersByTime(10000)
    expect(save).not.toHaveBeenCalled()
  })
})
