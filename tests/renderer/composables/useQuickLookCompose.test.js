import { describe, expect, it, vi } from 'vitest'
import { useQuickLookCompose } from '../../../src/renderer/src/composables/useQuickLookCompose'

const harness = (addResult = 'new-id') => {
  const add = vi.fn(async () => addResult)
  const update = vi.fn(async () => true)
  const onSaved = vi.fn()
  return { add, update, onSaved, c: useQuickLookCompose({ snippets: { add, update }, onSaved }) }
}

describe('useQuickLookCompose', () => {
  it('starts closed and opens with empty fields', () => {
    const { c } = harness()
    expect(c.composing.value).toBe(false)
    c.name.value = 'left over'
    c.body.value = 'left over'
    c.start()
    expect(c.composing.value).toBe(true)
    expect(c.name.value).toBe('')
    expect(c.body.value).toBe('')
  })

  it('saves a plaintext snippet and closes', async () => {
    const { add, onSaved, c } = harness()
    c.start()
    c.name.value = 'auth token'
    c.body.value = 'ghp_xxx'
    await c.save()
    expect(add).toHaveBeenCalledWith({
      name: 'auth token',
      content: 'ghp_xxx',
      language: 'plaintext',
      tags: []
    })
    expect(c.composing.value).toBe(false)
    expect(onSaved).toHaveBeenCalledWith('auth token')
  })

  // The store supplies a placeholder name, so only the body can block a save.
  it('allows an empty name but not an empty body', async () => {
    const { add, c } = harness()
    c.start()
    c.body.value = '   '
    expect(c.canSave.value).toBe(false)
    expect(await c.save()).toBe(null)
    expect(add).not.toHaveBeenCalled()

    c.body.value = 'something'
    expect(c.canSave.value).toBe(true)
    await c.save()
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ name: '' }))
  })

  // A null id means the vault key was unavailable; closing would silently drop
  // whatever was typed.
  it('stays open when the store refuses to store the snippet', async () => {
    const { onSaved, c } = harness(null)
    c.start()
    c.body.value = 'text'
    expect(await c.save()).toBe(null)
    expect(c.composing.value).toBe(true)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('does not fire a second save while one is in flight', async () => {
    const { add, c } = harness()
    c.start()
    c.body.value = 'text'
    const first = c.save()
    expect(c.canSave.value).toBe(false)
    expect(await c.save()).toBe(null)
    await first
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('cancel closes without saving', async () => {
    const { add, c } = harness()
    c.start()
    c.body.value = 'text'
    c.cancel()
    expect(c.composing.value).toBe(false)
    expect(add).not.toHaveBeenCalled()
  })
  // Editing an existing snippet reuses the same panel. The full body must come
  // from the caller: the preview is truncated to 4000 chars, so saving a
  // preview back would silently amputate anything longer.
  describe('edit mode', () => {
    it('opens prefilled and updates instead of adding', async () => {
      const { add, update, onSaved, c } = harness()
      c.startEdit({ id: 'abc', name: 'Untitled snippet', content: 'token=1' })
      expect(c.composing.value).toBe(true)
      expect(c.editing.value).toBe(true)
      expect(c.name.value).toBe('Untitled snippet')
      expect(c.body.value).toBe('token=1')

      c.name.value = 'Auth token'
      await c.save()
      expect(add).not.toHaveBeenCalled()
      expect(update).toHaveBeenCalledWith('abc', {
        name: 'Auth token',
        content: 'token=1',
        language: 'plaintext',
        tags: []
      })
      expect(c.composing.value).toBe(false)
      expect(onSaved).toHaveBeenCalledWith('Auth token')
    })

    it('preserves the tags an existing snippet already carries', async () => {
      const { update, c } = harness()
      c.startEdit({ id: 'abc', name: 'N', content: 'x', tags: ['work', 'keys'] })
      await c.save()
      expect(update).toHaveBeenCalledWith('abc', expect.objectContaining({ tags: ['work', 'keys'] }))
    })

    it('start() clears edit mode so the next + creates rather than overwrites', async () => {
      const { add, update, c } = harness()
      c.startEdit({ id: 'abc', name: 'N', content: 'x' })
      c.start()
      expect(c.editing.value).toBe(false)
      c.body.value = 'fresh'
      await c.save()
      expect(add).toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    })
  })
})
