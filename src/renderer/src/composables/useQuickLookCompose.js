import { computed, ref } from 'vue'

// Creating a snippet from the launcher, without raising the app. Plaintext only
// by design: the launcher stays lightweight (no Monaco, no language picker), so
// anything needing syntax or tags belongs in the main window's editor.

const PLAINTEXT = 'plaintext'

/**
 * @param {object} o
 * @param {{ add: (draft: object) => Promise<string|null> }} o.snippets  the snippet store
 * @param {(name: string) => void} [o.onSaved]  fires with the saved name
 * @returns {object}
 */
export function useQuickLookCompose({ snippets, onSaved = () => {} }) {
  const composing = ref(false)
  const name = ref('')
  const body = ref('')
  const saving = ref(false)
  // Set only in edit mode; the id decides update() vs add() at save time.
  const editingId = ref(null)
  const editingTags = ref([])
  const editing = computed(() => editingId.value !== null)

  // The body is what makes a snippet; an empty name falls back to a placeholder
  // in the store, so it is never what blocks a save.
  const canSave = computed(() => body.value.trim() !== '' && !saving.value)

  function start() {
    editingId.value = null
    editingTags.value = []
    name.value = ''
    body.value = ''
    saving.value = false
    composing.value = true
  }

  /**
   * Reopen an existing snippet in the same panel. `content` must be the FULL
   * body — the launcher's preview is truncated (MAX_PREVIEW_CHARS), and saving
   * a truncated copy back would silently amputate the snippet.
   * @param {{id: string, name: string, content: string, tags?: string[]}} snippet
   */
  function startEdit(snippet) {
    editingId.value = snippet.id
    editingTags.value = snippet.tags ?? []
    name.value = snippet.name ?? ''
    body.value = snippet.content ?? ''
    saving.value = false
    composing.value = true
  }

  function cancel() {
    composing.value = false
  }

  async function save() {
    if (!canSave.value) return null
    saving.value = true
    const draft = {
      name: name.value,
      content: body.value,
      language: PLAINTEXT,
      tags: editingTags.value
    }
    const id = editing.value
      ? ((await snippets.update(editingId.value, draft)) ?? true) && editingId.value
      : await snippets.add({ ...draft, tags: [] })
    saving.value = false
    // A null id means the vault key was unavailable — stay open rather than
    // closing over a snippet that was never stored.
    if (id) {
      composing.value = false
      onSaved(name.value)
    }
    return id
  }

  return { composing, editing, name, body, saving, canSave, start, startEdit, cancel, save }
}
