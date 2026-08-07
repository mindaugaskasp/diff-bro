import { computed, ref, watch } from 'vue'
import { detectSnippetLanguage } from '../utils/detectLanguage'
import { effectiveLanguage } from '../utils/snippetState'

// Creating a snippet from the launcher, without raising the app. The draft's
// language must stay 'auto': an explicit one overrides the store's own
// detection, costing the snippet its highlighting and its format tag.

const AUTO = 'auto'
const DETECT_IDLE_MS = 250

// `settled` is the body as of the last pause, and detection reads THAT rather
// than the live body — so one debounce serves both the guess and the switch
// back to Auto, which must be instant and would otherwise show a stale guess.
function useDraftLanguage(body) {
  const language = ref(AUTO)
  const settled = ref('')
  const detected = computed(() => detectSnippetLanguage(settled.value))
  const resolved = computed(() => effectiveLanguage(language.value, detected.value))
  let idle = null
  const stop = () => clearTimeout(idle)
  watch(body, (text) => {
    stop()
    idle = setTimeout(() => (settled.value = text), DETECT_IDLE_MS)
  })
  const reset = (lang) => {
    stop()
    language.value = lang || AUTO
    settled.value = body.value
  }
  return { language, resolved, stop, reset }
}

/** @returns {Promise<string|null>} the stored id, or null when the vault refused */
async function persist(snippets, editingId, draft) {
  if (!editingId) return snippets.add({ ...draft, tags: [] })
  await snippets.update(editingId, draft)
  return editingId
}

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
  const lang = useDraftLanguage(body)
  const language = lang.language
  const resolvedLanguage = lang.resolved

  // The body is what makes a snippet; an empty name falls back to a placeholder
  // in the store, so it is never what blocks a save.
  const canSave = computed(() => body.value.trim() !== '' && !saving.value)

  function open({ id = null, tags = [], as = '', text = '', lang: chosen }) {
    editingId.value = id
    editingTags.value = tags
    name.value = as
    body.value = text
    saving.value = false
    lang.reset(chosen)
    composing.value = true
  }

  function cancel() {
    lang.stop()
    composing.value = false
  }

  async function save() {
    if (!canSave.value) return null
    saving.value = true
    const id = await persist(snippets, editingId.value, {
      name: name.value,
      content: body.value,
      language: language.value,
      tags: editingTags.value
    })
    saving.value = false
    // A null id means the vault key was unavailable — stay open rather than
    // closing over a snippet that was never stored.
    if (!id) return null
    composing.value = false
    onSaved(name.value)
    return id
  }

  const start = (as = '') => open({ as })
  // `text` must be the FULL body: the launcher's preview is truncated, and
  // saving that back would amputate the snippet.
  const startEdit = (s) =>
    open({ id: s.id, as: s.name, text: s.content, tags: s.tags ?? [], lang: s.language })

  // prettier-ignore
  return {
    composing, editing, name, body, language, resolvedLanguage,
    saving, canSave, start, startEdit, cancel, save
  }
}
