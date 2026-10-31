import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSnippetDraft } from '../../../src/renderer/src/composables/useSnippetDraft'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'

// The snippet editor's only exits (Cancel, ×) run through requestClose. This
// covers the unsaved-changes guard that keeps a stray click from discarding
// typed/pasted code — the exact bug the layout can't catch.
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

// What the snippet tab hands the composable: the request, and what closing and
// saving mean in that host.
function hostFor(editing) {
  const host = { editing, closed: false, saved: null }
  host.onClose = () => (host.closed = true)
  host.onSaved = (id) => (host.saved = id)
  return host
}

function newDraft() {
  const snippets = useSnippetStore()
  const host = hostFor({ id: null })
  return { snippets, host, draft: useSnippetDraft(host) }
}

describe('useSnippetDraft — discard guard', () => {
  it('a fresh empty draft closes immediately, no confirmation', () => {
    const { host, draft } = newDraft()
    expect(draft.isDirty.value).toBe(false)
    draft.requestClose()
    expect(draft.confirmingDiscard.value).toBe(false)
    expect(host.closed).toBe(true)
  })

  it('a draft with typed content asks to confirm instead of closing', () => {
    const { host, draft } = newDraft()
    draft.content.value = 'critical pasted code'
    expect(draft.isDirty.value).toBe(true)

    draft.requestClose()
    expect(draft.confirmingDiscard.value).toBe(true)
    expect(host.closed).toBe(false)
  })

  it('a name alone (no content yet) still counts as unsaved', () => {
    const { draft } = newDraft()
    draft.name.value = 'My snippet'
    expect(draft.isDirty.value).toBe(true)
  })

  it('Keep editing dismisses the prompt and leaves the draft open', () => {
    const { host, draft } = newDraft()
    draft.content.value = 'x'
    draft.requestClose()
    draft.keepEditing()
    expect(draft.confirmingDiscard.value).toBe(false)
    expect(host.closed).toBe(false)
  })

  it('Discard closes the editor and drops the draft', () => {
    const { host, draft } = newDraft()
    draft.content.value = 'x'
    draft.requestClose()
    draft.discardDraft()
    expect(draft.confirmingDiscard.value).toBe(false)
    expect(host.closed).toBe(true)
  })
})

// Open an existing snippet for viewing (store.load is stubbed so no crypto runs).
function existingDraft() {
  const snippets = useSnippetStore()
  snippets.entries = [{ id: 'x', name: 'Existing', tags: ['a'], language: 'plaintext' }]
  snippets.load = async () => 'body text'
  const host = hostFor({ id: 'x' })
  return { snippets, host, draft: useSnippetDraft(host) }
}

describe('useSnippetDraft — view/edit mode', () => {
  it('a new snippet opens straight into edit mode', () => {
    const { draft } = newDraft()
    expect(draft.editMode.value).toBe(true)
  })

  it('an existing snippet opens read-only (view mode) and Edit unlocks it', () => {
    const { draft } = existingDraft()
    expect(draft.editMode.value).toBe(false)
    draft.startEditing()
    expect(draft.editMode.value).toBe(true)
  })
})

// Pasted Mermaid arrives with autocorrected arrows and rich-text spaces. Repair
// rides the Format button the editor already has, rather than a second control.
// The tab decides what saving leads to; the composable reports the id, and a
// new snippet's id is how its tab stops being a draft.
describe('useSnippetDraft — saving reports to its host', () => {
  it('reports the new id after saving a NEW snippet, and the snippet is stored', async () => {
    const { snippets, host, draft } = newDraft()
    window.api.vaultEncrypt = async () => ({ iv: 'iv', data: 'data' })
    draft.name.value = 'My note'
    draft.content.value = 'remember to hydrate'

    await draft.save({ tags: [], tagColors: {} })

    expect(host.saved).toBe(snippets.entries[0].id)
    expect(draft.isDirty.value).toBe(false)
    expect(snippets.entries).toHaveLength(1)
    expect(snippets.entries[0].name).toBe('My note')
  })

  it('reports the same id after saving an EDIT of an existing snippet', async () => {
    const snippets = useSnippetStore()
    window.api.vaultEncrypt = async () => ({ iv: 'iv', data: 'data' })
    const id = await snippets.add({ name: 'Original', content: 'body' })
    // The composable decrypts on mount; without this it rejects unhandled.
    window.api.vaultDecrypt = async () => 'body'
    const host = hostFor({ id })
    const draft = useSnippetDraft(host)
    draft.editMode.value = true
    draft.name.value = 'Renamed'
    // save() guards on non-empty content; the real editor has it decrypted by now.
    draft.content.value = 'body'

    await draft.save({ tags: [], tagColors: {} })

    expect(host.saved).toBe(id)
    expect(snippets.entries[0].name).toBe('Renamed')
  })

  it('reports nothing when the vault key is unavailable, so the draft can retry', async () => {
    const { snippets, host, draft } = newDraft()
    window.api.vaultEncrypt = async () => ({ error: 'vault-key-unavailable' })
    draft.name.value = 'My note'
    draft.content.value = 'body'

    await draft.save({ tags: [], tagColors: {} })

    expect(host.saved).toBeNull()
    expect(draft.isDirty.value).toBe(true)
    expect(snippets.entries).toHaveLength(0)
  })
})

// Secret is set from the row menu, so an open document follows the library.
describe('useSnippetDraft — secret follows the library', () => {
  it('masks the moment the entry is marked secret, and never counts as an edit', async () => {
    const snippets = useSnippetStore()
    window.api.vaultEncrypt = async () => ({ iv: 'iv', data: 'data' })
    window.api.vaultDecrypt = async () => 'body'
    const id = await snippets.add({ name: 'Key', content: 'body' })
    const draft = useSnippetDraft(hostFor({ id }))
    expect(draft.masked.value).toBe(false)

    snippets.setSnippetSecret(id, true)
    expect(draft.secret.value).toBe(true)
    expect(draft.masked.value).toBe(true)
    expect(draft.isDirty.value).toBe(false)

    snippets.setSnippetSecret(id, false)
    expect(draft.masked.value).toBe(false)
  })

  it('a new snippet is never secret', () => {
    const { draft } = newDraft()
    expect(draft.secret.value).toBe(false)
  })
})

describe('useSnippetDraft — repairing a diagram', () => {
  const BROKEN = 'flowchart TD\n  A —> B  '

  it('offers Format for a Mermaid draft', () => {
    const { draft } = newDraft()
    draft.chosenLanguage.value = 'mermaid'
    expect(draft.canFormat.value).toBe(false) // nothing to repair yet
    draft.content.value = BROKEN
    expect(draft.canFormat.value).toBe(true)
  })

  it('repairs the content and says it did', () => {
    const { draft } = newDraft()
    draft.chosenLanguage.value = 'mermaid'
    draft.content.value = BROKEN
    draft.formatContent()
    expect(draft.content.value).toBe('flowchart TD\n  A --> B')
    expect(useDiffStore().notice).toContain('Repaired')
  })

  // The effect is often invisible, so silence on a clean diagram would read as a
  // broken button.
  it('says so when there was nothing to repair', () => {
    const { draft } = newDraft()
    draft.chosenLanguage.value = 'mermaid'
    draft.content.value = 'flowchart TD\n  A --> B'
    draft.formatContent()
    expect(draft.content.value).toBe('flowchart TD\n  A --> B')
    expect(useDiffStore().notice).toContain('Nothing to repair')
  })
})

describe('useSnippetDraft — tags are part of the draft', () => {
  async function savedDraft(tags) {
    const snippets = useSnippetStore()
    window.api.vaultEncrypt = async () => ({ iv: 'iv', data: 'data' })
    window.api.vaultDecrypt = async () => 'body'
    const id = await snippets.add({ name: 'Original', content: 'body', tags })
    const draft = useSnippetDraft(hostFor({ id }))
    await new Promise((settled) => setTimeout(settled))
    return { snippets, id, draft }
  }

  it('a changed tag alone makes the draft dirty, and undoing it makes it clean', async () => {
    const { draft } = await savedDraft(['alpha'])
    draft.setTags(['alpha', 'beta'])
    expect(draft.isDirty.value).toBe(true)
    draft.setTags(['alpha'])
    expect(draft.isDirty.value).toBe(false)
  })

  it('saving takes the tags as the new baseline', async () => {
    const { snippets, id, draft } = await savedDraft(['alpha'])
    draft.setTags(['beta'])
    await draft.save({ tags: ['beta'], tagColors: {} })
    expect(draft.isDirty.value).toBe(false)
    expect(snippets.entries.find((e) => e.id === id).tags).toEqual(['beta'])
  })

  it('saves nothing when the tag field refused what was typed', async () => {
    const { snippets, id, draft } = await savedDraft(['alpha'])
    draft.name.value = 'Renamed'
    await draft.save(null)
    expect(snippets.entries.find((e) => e.id === id).name).toBe('Original')
  })
})
