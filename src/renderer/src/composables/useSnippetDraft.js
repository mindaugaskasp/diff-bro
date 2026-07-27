import { computed, ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { useSettingsStore } from '../stores/settingsStore'
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
  const settings = useSettingsStore()

  const editing = store.editingSnippet
  const isNew = editing.id == null
  const existing = isNew ? null : store.entries.find((e) => e.id === editing.id)
  const initial = initialFields(editing, existing)

  const name = ref(initial.name)
  const content = ref(initial.content)
  const saving = ref(false)
  const initialTags = initial.tags

  // Existing snippets open read-only ("view mode") so a glance can't become an
  // accidental edit; the Edit button unlocks them. New snippets start editable.
  const editMode = ref(isNew)
  const startEditing = () => {
    editMode.value = true
  }

  // Baseline for the unsaved-changes guard: the fields as first shown. For an
  // existing snippet the real content arrives only after decryption, so the
  // baseline updates when it lands — an untouched snippet is never "dirty".
  const baselineName = ref(initial.name)
  const baselineContent = ref(initial.content)

  // An existing snippet's content has to be decrypted before it can be shown.
  if (!isNew)
    store.load(editing.id).then((text) => {
      content.value = text ?? ''
      baselineContent.value = text ?? ''
    })

  // 'auto' defers to the content-based detector; any other value is the user's
  // explicit syntax choice, remembered with the snippet.
  const chosenLanguage = ref(initial.language)
  const language = computed(() =>
    chosenLanguage.value === 'auto' ? detectSnippetLanguage(content.value) : chosenLanguage.value
  )
  const isMermaid = computed(() => language.value === 'mermaid')
  // The Jira/Confluence formatting toolbar shows only for this syntax (it is
  // explicit-only — the auto-detector never guesses it).
  const isJira = computed(() => language.value === 'jira')

  function close() {
    store.editingSnippet = null
  }

  // Unsaved-changes guard. The editor's only exits are Cancel and the × (Escape
  // is disabled, the backdrop is inert), and both would silently drop typed or
  // pasted code. When the draft differs from what was first shown, a close
  // request asks to confirm instead of closing; an untouched draft closes at
  // once.
  const isDirty = computed(
    () => name.value !== baselineName.value || content.value !== baselineContent.value
  )
  const confirmingDiscard = ref(false)
  function requestClose() {
    if (isDirty.value) confirmingDiscard.value = true
    else close()
  }
  function keepEditing() {
    confirmingDiscard.value = false
  }
  function discardDraft() {
    confirmingDiscard.value = false
    close()
  }

  // `tags` and `tagColors` come from the tag field, which owns them.
  async function save({ tags, tagColors }) {
    // A snippet needs both a name and content; the button is disabled without
    // them, this guards the Enter/programmatic path. The `saving` check guards a
    // fast double-click, whose async store call would otherwise duplicate.
    if (!name.value.trim() || !content.value.trim() || saving.value) return
    // Keep the app stable: refuse a snippet larger than the configured limit
    // (Settings → Interface). Measured in bytes so multibyte content counts.
    const bytes = new TextEncoder().encode(content.value).length
    if (bytes > settings.maxSnippetSizeBytes) {
      diff.showNotice(
        `That snippet is ${(bytes / 1024).toFixed(0)} KB — over the ${settings.maxSnippetSizeKb} KB limit. Raise it in Settings if you really need to.`
      )
      return
    }
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
    await window.api.copyText(content.value)
    diff.showNotice('Copied snippet to clipboard.')
  }

  function expandDiagram() {
    if (!content.value.trim()) return
    // Close the editor first: the viewer and this dialog are siblings at the
    // same stacking level, so leaving the editor open would render it on top of
    // the diagram and nothing would appear to happen. The full-window viewer
    // stands on its own.
    diff.openMermaid(name.value.trim() || 'Diagram', content.value)
    close()
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
    isJira,
    editMode,
    startEditing,
    canFormat,
    save,
    close,
    isDirty,
    confirmingDiscard,
    requestClose,
    keepEditing,
    discardDraft,
    formatContent,
    copyContent,
    expandDiagram
  }
}
