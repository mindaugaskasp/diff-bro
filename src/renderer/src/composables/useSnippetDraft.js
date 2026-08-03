import { computed, ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useImageExportStore } from '../features/imageExport'
import { detectSnippetLanguage } from '../utils/detectLanguage'
import { formatJson, formatXml } from '../utils/textFormats'
import { formatSql } from '../utils/sqlFormat'
import { repairMermaid } from '../utils/mermaid'
import { useUiStore } from '../stores/uiStore'

// Mermaid's entry repairs rather than pretty-prints — see repairMermaid.
const FORMATTERS = { json: formatJson, xml: formatXml, sql: formatSql, mermaid: repairMermaid }

// A blank draft or the existing snippet's metadata; its content arrives later
// (decrypted).
function initialFields(editing, existing) {
  if (!existing) {
    return {
      name: '',
      content: editing.initialContent ?? '',
      tags: editing.initialTags ?? [],
      language: editing.initialLanguage ?? 'auto',
      secret: false
    }
  }
  return {
    name: existing.name ?? '',
    content: '',
    tags: existing.tags ?? [],
    language: existing.language || 'auto',
    secret: existing.secret === true
  }
}

export function useSnippetDraft() {
  const store = useSnippetStore()
  const diff = useDiffStore()
  const settings = useSettingsStore()

  const editing = store.editingSnippet
  // A new snippet becomes existing after its first save, so re-save updates.
  const isNew = ref(editing.id == null)
  const existing = isNew.value ? null : store.entries.find((e) => e.id === editing.id)
  const initial = initialFields(editing, existing)

  const name = ref(initial.name)
  const content = ref(initial.content)
  const secret = ref(initial.secret)
  // A new snippet is being typed, so it starts shown; an existing secret opens
  // masked and only un-masks when its owner asks. Reveal is per-open, never
  // stored — reopening a secret always starts hidden again.
  const revealed = ref(isNew.value)
  const masked = computed(() => secret.value && !revealed.value)
  const toggleReveal = () => (revealed.value = !revealed.value)
  const saving = ref(false)
  const initialTags = initial.tags

  // Existing snippets open read-only so a glance can't become an accidental edit.
  const editMode = ref(isNew.value)
  const startEditing = () => {
    editMode.value = true
  }

  // Dirty-guard baseline; for an existing snippet it updates when the decrypted
  // content lands, so an untouched snippet is never "dirty".
  const baselineName = ref(initial.name)
  const baselineContent = ref(initial.content)

  if (!isNew.value)
    store.load(editing.id).then((text) => {
      content.value = text ?? ''
      baselineContent.value = text ?? ''
    })

  // 'auto' defers to the content detector; any other value is the user's pick.
  const chosenLanguage = ref(initial.language)
  const language = computed(() =>
    chosenLanguage.value === 'auto' ? detectSnippetLanguage(content.value) : chosenLanguage.value
  )
  const isMermaid = computed(() => language.value === 'mermaid')
  // Jira is explicit-only (the detector never guesses it).
  const isJira = computed(() => language.value === 'jira')
  const isMarkdown = computed(() => language.value === 'markdown')

  function close() {
    store.editingSnippet = null
  }

  // Unsaved-changes guard: a dirty draft confirms before closing.
  const baselineSecret = ref(initial.secret)
  const isDirty = computed(
    () =>
      name.value !== baselineName.value ||
      content.value !== baselineContent.value ||
      secret.value !== baselineSecret.value
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
    // Guards the Enter/programmatic path + a fast double-click.
    if (!name.value.trim() || !content.value.trim() || saving.value) return
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
      secret: secret.value,
      tags,
      tagColors
    }
    if (isNew.value) {
      const id = await store.add(fields)
      saving.value = false
      if (id == null) return // key unavailable — keep the draft open so it can retry
      editing.id = id
      isNew.value = false
    } else {
      await store.update(editing.id, fields)
      saving.value = false
    }
    // Save drops back to view mode rather than closing; reset the dirty baseline.
    baselineName.value = name.value
    baselineContent.value = content.value
    baselineSecret.value = secret.value
    // Saved secrets go straight back behind the mask.
    if (secret.value) revealed.value = false
    editMode.value = false
  }

  const canFormat = computed(() => !!content.value.trim() && !!FORMATTERS[language.value])
  function formatContent() {
    const fmt = FORMATTERS[language.value]
    if (!fmt) return
    try {
      const next = fmt(content.value)
      // A repair's effect is often invisible, so it reports either way.
      if (isMermaid.value) {
        diff.showNotice(next === content.value ? 'Nothing to repair.' : 'Repaired the diagram.')
      }
      content.value = next
    } catch {
      diff.showNotice(`Couldn't format — the content isn't valid ${language.value.toUpperCase()}.`)
    }
  }

  // Returns whether it copied, so the button flashes only on success.
  async function copyContent() {
    if (!content.value) return false
    await window.api.copyText(content.value)
    return true
  }

  // A picture of the SNIPPET, not of the editor: the dialog closes first, the
  // way the diagram expander does, and the stage is photographed underneath it.
  function captureImage() {
    if (!editing.id) return
    const id = editing.id
    close()
    useImageExportStore().exportSnippetImage(id)
  }

  function expandDiagram() {
    if (!content.value.trim()) return
    // Close the editor first, or it would stack over the viewer.
    useUiStore().openMermaid(name.value.trim() || 'Diagram', content.value)
    close()
  }

  return {
    isNew,
    name,
    content,
    secret,
    revealed,
    masked,
    toggleReveal,
    saving,
    initialTags,
    chosenLanguage,
    language,
    isMermaid,
    isJira,
    isMarkdown,
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
    captureImage,
    expandDiagram
  }
}
