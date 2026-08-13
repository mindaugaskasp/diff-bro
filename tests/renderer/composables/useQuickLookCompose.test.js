import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
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
    c.open()
    expect(c.composing.value).toBe(true)
    expect(c.name.value).toBe('')
    expect(c.body.value).toBe('')
  })

  it("saves with language auto, so the store's detection decides", async () => {
    const { add, onSaved, c } = harness()
    c.open()
    c.name.value = 'auth token'
    c.body.value = 'ghp_xxx'
    await c.save()
    expect(add).toHaveBeenCalledWith({
      name: 'auth token',
      content: 'ghp_xxx',
      language: 'auto',
      tags: []
    })
    expect(c.composing.value).toBe(false)
    expect(onSaved).toHaveBeenCalledWith('auth token')
  })

  // The store supplies a placeholder name, so only the body can block a save.
  it('allows an empty name but not an empty body', async () => {
    const { add, c } = harness()
    c.open()
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
    c.open()
    c.body.value = 'text'
    expect(await c.save()).toBe(null)
    expect(c.composing.value).toBe(true)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('does not fire a second save while one is in flight', async () => {
    const { add, c } = harness()
    c.open()
    c.body.value = 'text'
    const first = c.save()
    expect(c.canSave.value).toBe(false)
    expect(await c.save()).toBe(null)
    await first
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('cancel closes without saving', async () => {
    const { add, c } = harness()
    c.open()
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
      c.open({ id: 'abc', name: 'Untitled snippet', content: 'token=1' })
      expect(c.composing.value).toBe(true)
      expect(c.editing.value).toBe(true)
      expect(c.name.value).toBe('Untitled snippet')
      expect(c.body.value).toBe('token=1')

      c.name.value = 'Auth token'
      await c.save()
      expect(add).not.toHaveBeenCalled()
      // A rename with untouched content must not record a history version.
      expect(update).toHaveBeenCalledWith('abc', {
        name: 'Auth token',
        content: 'token=1',
        language: 'auto',
        contentChanged: false,
        tags: []
      })
      expect(c.composing.value).toBe(false)
      expect(onSaved).toHaveBeenCalledWith('Auth token')
    })

    it('a content edit says so, so the store records the superseded version', async () => {
      const { update, c } = harness()
      c.open({ id: 'abc', name: 'N', content: 'token=1' })
      c.body.value = 'token=2'
      await c.save()
      expect(update).toHaveBeenCalledWith('abc', expect.objectContaining({ contentChanged: true }))
    })

    it('preserves the tags an existing snippet already carries', async () => {
      const { update, c } = harness()
      c.open({ id: 'abc', name: 'N', content: 'x', tags: ['work', 'keys'] })
      await c.save()
      expect(update).toHaveBeenCalledWith(
        'abc',
        expect.objectContaining({ tags: ['work', 'keys'] })
      )
    })

    it('open() with no id clears edit mode so the next create does not overwrite', async () => {
      const { add, update, c } = harness()
      c.open({ id: 'abc', name: 'N', content: 'x' })
      c.open()
      expect(c.editing.value).toBe(false)
      c.body.value = 'fresh'
      await c.save()
      expect(add).toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    })
  })
})

// The launcher's query is almost always the name of the thing you failed to
// find, so Cmd+N carries it across rather than making you retype it.
describe('useQuickLookCompose — seeded name', () => {
  it('open({name}) prefills the name and leaves the body empty', () => {
    const { c } = harness()
    c.open({ name: 'deploy rollback' })
    expect(c.name.value).toBe('deploy rollback')
    expect(c.body.value).toBe('')
  })

  it('open() with no argument still opens blank', () => {
    const { c } = harness()
    c.open()
    expect(c.name.value).toBe('')
  })
})

describe('useQuickLookCompose — language', () => {
  const settle = () => vi.advanceTimersByTimeAsync(300)

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts on auto and resolves to what the body looks like', async () => {
    const { c } = harness()
    c.open()
    expect(c.language.value).toBe('auto')
    c.body.value = 'SELECT id FROM orders;'
    await settle()
    expect(c.resolvedLanguage.value).toBe('sql')
  })

  it('waits for a pause rather than re-detecting every keystroke', async () => {
    const { c } = harness()
    c.open()
    c.body.value = 'SELECT id FROM orders;'
    expect(c.resolvedLanguage.value).toBe('plaintext')
    await settle()
    expect(c.resolvedLanguage.value).toBe('sql')
  })

  it('an explicit choice survives a later body change', async () => {
    const { c } = harness()
    c.open()
    c.language.value = 'plaintext'
    c.body.value = 'SELECT id FROM orders;'
    await settle()
    expect(c.resolvedLanguage.value).toBe('plaintext')
  })

  it('returning to auto re-reads the body it skipped', async () => {
    const { c } = harness()
    c.open()
    c.language.value = 'plaintext'
    c.body.value = 'SELECT id FROM orders;'
    await settle()
    c.language.value = 'auto'
    expect(c.resolvedLanguage.value).toBe('sql')
  })

  it('saves the CHOICE, not the guess — the store re-detects on its own', async () => {
    const { add, c } = harness()
    c.open()
    c.body.value = 'SELECT id FROM orders;'
    await settle()
    await c.save()
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ language: 'auto' }))
  })

  it('open() clears a language pinned by the previous snippet', async () => {
    const { c } = harness()
    c.open()
    c.language.value = 'python'
    c.open({ name: 'next one' })
    expect(c.language.value).toBe('auto')
  })

  it('open() adopts an existing language so a save cannot relabel it', () => {
    const { c } = harness()
    c.open({ id: 'a', name: 'N', content: 'print(1)', language: 'python' })
    expect(c.language.value).toBe('python')
  })
})

// Pressing the summon chord twice is how the launcher is dismissed and brought
// back, and refresh() used to cancel the panel on the way in. `dirty` is what
// tells a draft with work in it from an untouched one.
describe('useQuickLookCompose — a draft worth keeping', () => {
  it('is not dirty while closed, or freshly opened', () => {
    const { c } = harness()
    expect(c.dirty.value).toBe(false)
    c.open()
    expect(c.dirty.value).toBe(false)
  })

  it('a name carried in from the query is not, by itself, work', () => {
    const { c } = harness()
    c.open({ name: 'deploy rollback' })
    expect(c.dirty.value).toBe(false)
  })

  it('a typed body or an edited name is', () => {
    const { c } = harness()
    c.open({ name: 'deploy rollback' })
    c.body.value = 'kubectl rollout undo'
    expect(c.dirty.value).toBe(true)

    c.open({ id: 'a', name: 'N', content: 'x' })
    expect(c.dirty.value).toBe(false)
    c.name.value = 'N2'
    expect(c.dirty.value).toBe(true)
  })

  it('stops being dirty once the draft is saved or dropped', async () => {
    const { c } = harness()
    c.open()
    c.body.value = 'text'
    await c.save()
    expect(c.dirty.value).toBe(false)

    c.open()
    c.body.value = 'more'
    c.cancel()
    expect(c.dirty.value).toBe(false)
  })
})

// The card is 452px tall at rest — nine lines. Composing asks main for the size
// the job needs; the renderer names the JOB, never a number of pixels.
describe('useQuickLookCompose — the card it asks for', () => {
  afterEach(() => delete window.api)

  it('asks for the compose card on open and the resting one on the way out', async () => {
    const quickLookMode = vi.fn()
    window.api = { quickLookMode }
    const { c } = harness()

    c.open()
    await nextTick()
    expect(quickLookMode).toHaveBeenLastCalledWith('compose')

    c.cancel()
    await nextTick()
    expect(quickLookMode).toHaveBeenLastCalledWith('default')
  })
})

// Reopening the selected row is what makes the launcher an editor. The body it
// loads must be the stored one: the preview is truncated at 4000 chars.
describe('useQuickLookCompose — editing the selected row', () => {
  const rowHarness = (row) => {
    const current = ref(row)
    const load = vi.fn(async () => 'the whole stored body')
    const c = useQuickLookCompose({ snippets: { add: vi.fn(), update: vi.fn(), load }, current })
    return { c, load, current }
  }

  it('opens the panel on the stored body', async () => {
    const { c, load } = rowHarness({ kind: 'snippet', id: 'a', name: 'N', lang: 'sql', tags: [] })
    expect(c.canEdit.value).toBe(true)
    await c.editCurrent()
    expect(load).toHaveBeenCalledWith('a')
    expect(c.composing.value).toBe(true)
    expect(c.body.value).toBe('the whole stored body')
  })

  it('refuses a secret, a diagram, and anything that is not a snippet', async () => {
    const secret = rowHarness({ kind: 'snippet', id: 'a', secret: true })
    expect(secret.c.canEdit.value).toBe(false)
    await secret.c.editCurrent()
    expect(secret.c.composing.value).toBe(false)

    expect(rowHarness({ kind: 'snippet', id: 'a', lang: 'mermaid' }).c.canEdit.value).toBe(false)
    expect(rowHarness({ kind: 'command', id: 'base64' }).c.canEdit.value).toBe(false)
    expect(rowHarness(null).c.canEdit.value).toBe(false)
  })
})
