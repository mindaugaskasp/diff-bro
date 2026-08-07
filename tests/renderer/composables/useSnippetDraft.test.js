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

// Put the store into "creating a new snippet" mode.
function newDraft() {
  const snippets = useSnippetStore()
  snippets.editingSnippet = { id: null }
  return { snippets, draft: useSnippetDraft() }
}

describe('useSnippetDraft — discard guard', () => {
  it('a fresh empty draft closes immediately, no confirmation', () => {
    const { snippets, draft } = newDraft()
    expect(draft.isDirty.value).toBe(false)
    draft.requestClose()
    expect(draft.confirmingDiscard.value).toBe(false)
    expect(snippets.editingSnippet).toBeNull() // closed
  })

  it('a draft with typed content asks to confirm instead of closing', () => {
    const { snippets, draft } = newDraft()
    draft.content.value = 'critical pasted code'
    expect(draft.isDirty.value).toBe(true)

    draft.requestClose()
    expect(draft.confirmingDiscard.value).toBe(true)
    expect(snippets.editingSnippet).not.toBeNull() // still open — nothing lost
  })

  it('a name alone (no content yet) still counts as unsaved', () => {
    const { draft } = newDraft()
    draft.name.value = 'My snippet'
    expect(draft.isDirty.value).toBe(true)
  })

  it('Keep editing dismisses the prompt and leaves the draft open', () => {
    const { snippets, draft } = newDraft()
    draft.content.value = 'x'
    draft.requestClose()
    draft.keepEditing()
    expect(draft.confirmingDiscard.value).toBe(false)
    expect(snippets.editingSnippet).not.toBeNull()
  })

  it('Discard closes the editor and drops the draft', () => {
    const { snippets, draft } = newDraft()
    draft.content.value = 'x'
    draft.requestClose()
    draft.discardDraft()
    expect(draft.confirmingDiscard.value).toBe(false)
    expect(snippets.editingSnippet).toBeNull() // discarded
  })
})

// Open an existing snippet for viewing (store.load is stubbed so no crypto runs).
function existingDraft() {
  const snippets = useSnippetStore()
  snippets.entries = [{ id: 'x', name: 'Existing', tags: ['a'], language: 'plaintext' }]
  snippets.load = async () => 'body text'
  snippets.editingSnippet = { id: 'x' }
  return { snippets, draft: useSnippetDraft() }
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
// Saving is a finished action: it closes the editor and returns you to the
// list, rather than parking you in a read-only view of what you just wrote.
describe('useSnippetDraft — saving closes the editor', () => {
  it('closes after saving a NEW snippet, and the snippet is stored', async () => {
    const { snippets, draft } = newDraft()
    window.api.vaultEncrypt = async () => ({ iv: 'iv', data: 'data' })
    draft.name.value = 'My note'
    draft.content.value = 'remember to hydrate'

    await draft.save({ tags: [], tagColors: {} })

    expect(snippets.editingSnippet).toBeNull()
    expect(snippets.entries).toHaveLength(1)
    expect(snippets.entries[0].name).toBe('My note')
  })

  it('closes after saving an EDIT of an existing snippet', async () => {
    const snippets = useSnippetStore()
    window.api.vaultEncrypt = async () => ({ iv: 'iv', data: 'data' })
    const id = await snippets.add({ name: 'Original', content: 'body' })
    // The composable decrypts on mount; without this it rejects unhandled.
    window.api.vaultDecrypt = async () => 'body'
    snippets.editingSnippet = { id }
    const draft = useSnippetDraft()
    draft.editMode.value = true
    draft.name.value = 'Renamed'
    // save() guards on non-empty content; the real editor has it decrypted by now.
    draft.content.value = 'body'

    await draft.save({ tags: [], tagColors: {} })

    expect(snippets.editingSnippet).toBeNull()
    expect(snippets.entries[0].name).toBe('Renamed')
  })

  it('stays OPEN when the vault key is unavailable, so the draft can retry', async () => {
    const { snippets, draft } = newDraft()
    window.api.vaultEncrypt = async () => ({ error: 'vault-key-unavailable' })
    draft.name.value = 'My note'
    draft.content.value = 'body'

    await draft.save({ tags: [], tagColors: {} })

    // Closing here would silently destroy what the user typed.
    expect(snippets.editingSnippet).not.toBeNull()
    expect(snippets.entries).toHaveLength(0)
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
