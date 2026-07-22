import { computed, ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { detectSnippetLanguage } from '../utils/detectLanguage'
import { formatJson, formatXml } from '../utils/textFormats'
import { formatSql } from '../utils/sqlFormat'

// Pretty-printers for the syntaxes the Tools menu also formats, keyed by the
// Monaco language id the editor resolves to.
const FORMATTERS = { json: formatJson, xml: formatXml, sql: formatSql }

// Where the dialog starts from: a blank draft (optionally prefilled by a Tools
// dialog's "Add to Snippets") or the existing snippet's metadata. Content for an
// existing snippet arrives later — it has to be decrypted.
function initialFields(editing, existing) {
  if (!existing) {
    return {
      name: '',
      content: editing.initialContent ?? '',
      tags: editing.initialTags ?? [],
      language: editing.initialLanguage ?? 'auto'
    }
  }
  return {
    name: existing.name ?? '',
    content: '',
    tags: existing.tags ?? [],
    language: existing.language || 'auto'
  }
}

// The snippet being edited: its fields, the syntax it resolves to, and the
// operations the editor dialog offers on it. Kept out of the component so the
// dialog is layout plus Monaco wiring.
export function useSnippetDraft() {
  const store = useSnippetStore()
  const diff = useDiffStore()

  const editing = store.editingSnippet
  const isNew = editing.id == null
  const existing = isNew ? null : store.entries.find((e) => e.id === editing.id)
  const initial = initialFields(editing, existing)

  const name = ref(initial.name)
  const content = ref(initial.content)
  const saving = ref(false)
  const initialTags = initial.tags

  // An existing snippet's content has to be decrypted before it can be shown.
  if (!isNew) store.load(editing.id).then((text) => (content.value = text ?? ''))

  // 'auto' defers to the content-based detector; any other value is the user's
  // explicit syntax choice, remembered with the snippet.
  const chosenLanguage = ref(initial.language)
  const language = computed(() =>
    chosenLanguage.value === 'auto' ? detectSnippetLanguage(content.value) : chosenLanguage.value
  )
  const isMermaid = computed(() => language.value === 'mermaid')

  function close() {
    store.editingSnippet = null
  }

  // `tags` and `tagColors` come from the tag field, which owns them.
  async function save({ tags, tagColors }) {
    // Guard against a fast double-click: the store call is async (IPC round
    // trip), so a second click before it resolves would create a duplicate.
    if (!name.value.trim() || saving.value) return
    saving.value = true
    const fields = {
      name: name.value,
      content: content.value,
      language: chosenLanguage.value,
      tags,
      tagColors
    }
    if (isNew) await store.add(fields)
    else await store.update(editing.id, fields)
    close()
  }

  // Pretty-print when the syntax is one we can format; invalid content is
  // reported rather than mangled.
  const canFormat = computed(() => !!content.value.trim() && !!FORMATTERS[language.value])
  function formatContent() {
    const fmt = FORMATTERS[language.value]
    if (!fmt) return
    try {
      content.value = fmt(content.value)
    } catch {
      diff.showNotice(`Couldn't format — the content isn't valid ${language.value.toUpperCase()}.`)
    }
  }

  async function copyContent() {
    if (!content.value) return
    await navigator.clipboard.writeText(content.value)
    diff.showNotice('Copied snippet to clipboard.')
  }

  function expandDiagram() {
    if (content.value.trim()) diff.openMermaid(name.value.trim() || 'Diagram', content.value)
  }

  return {
    isNew,
    name,
    content,
    saving,
    initialTags,
    chosenLanguage,
    language,
    isMermaid,
    canFormat,
    save,
    close,
    formatContent,
    copyContent,
    expandDiagram
  }
}
