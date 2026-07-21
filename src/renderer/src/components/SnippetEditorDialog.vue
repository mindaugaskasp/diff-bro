<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useSnippetStore, MAX_TAGS, TAG_PALETTE, cleanTag } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { detectSnippetLanguage, SNIPPET_LANGUAGES } from '../utils/detectLanguage'
import { formatJson, formatXml } from '../utils/textFormats'
import { formatSql } from '../utils/sqlFormat'
import TagGlyph from './TagGlyph.vue'
import MermaidDiagram from './MermaidDiagram.vue'

const store = useSnippetStore()
const diff = useDiffStore()

// Pretty-printers for the syntaxes the Tools menu also formats. Keyed by the
// Monaco language id the editor resolves to (see `language` below).
const FORMATTERS = { json: formatJson, xml: formatXml, sql: formatSql }
const container = ref(null)
const name = ref('')
const content = ref('')
const isNew = store.editingSnippet.id == null
const saving = ref(false)
let editor = null

// Up to 5 color-coded tags; no tags means the Default catch-all.
const existingEntry = isNew ? null : store.entries.find((e) => e.id === store.editingSnippet.id)
const tags = ref(
  isNew ? [...(store.editingSnippet.initialTags ?? [])] : [...(existingEntry?.tags ?? [])]
)
const tagInput = ref('')
const tagInputEl = ref(null)
// Colors chosen for tags typed here that don't exist yet — kept locally and
// only written to the registry when the snippet is saved, so abandoning the
// editor never creates a stray tag.
const tentativeColors = ref({})
const canAddMore = computed(() => tags.value.length < MAX_TAGS)
// Existing tags not already applied, matching what's typed, recent-first.
const suggestions = computed(() => {
  const q = tagInput.value.trim().toLowerCase()
  return store.tagList
    .map((t) => t.name)
    .filter((n) => !tags.value.includes(n) && n.includes(q))
    .slice(0, 8)
})
// Display color: the registry color if the tag exists, else its tentative one.
function colorFor(t) {
  return store.colorOf(t) || tentativeColors.value[t] || 'var(--text-dim)'
}
function nextTentativeColor() {
  const used = new Set([
    ...Object.values(store.tags).map((t) => t.color),
    ...Object.values(tentativeColors.value)
  ])
  return TAG_PALETTE.find((c) => !used.has(c)) ?? TAG_PALETTE[0]
}
function addTag(raw) {
  if (!canAddMore.value) return
  const n = cleanTag(raw)
  if (!n || tags.value.includes(n)) {
    tagInput.value = ''
    return
  }
  // New tag: reserve a tentative color (not persisted until save).
  if (!store.colorOf(n) && !tentativeColors.value[n]) {
    tentativeColors.value = { ...tentativeColors.value, [n]: nextTentativeColor() }
  }
  tags.value.push(n)
  tagInput.value = ''
}
function removeTag(t) {
  tags.value = tags.value.filter((x) => x !== t)
}
function onTagKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (tagInput.value.trim()) addTag(tagInput.value)
  } else if (e.key === 'Backspace' && !tagInput.value && tags.value.length) {
    tags.value.pop()
  }
}

const languages = SNIPPET_LANGUAGES
// 'auto' defers to the content-based detector; any other value is the
// user's explicit syntax choice, remembered with the snippet.
const chosenLanguage = ref(
  existingEntry?.language || store.editingSnippet.initialLanguage || 'auto'
)
const language = computed(() =>
  chosenLanguage.value === 'auto' ? detectSnippetLanguage(content.value) : chosenLanguage.value
)
// Mermaid snippets get a live diagram preview and an expand-to-viewer button.
const isMermaid = computed(() => language.value === 'mermaid')
function expandDiagram() {
  if (content.value.trim()) diff.openMermaid(name.value.trim() || 'Diagram', content.value)
}

onMounted(async () => {
  editor = monaco.editor.create(container.value, {
    value: '',
    language: 'plaintext',
    theme: diff.theme === 'light' ? 'vs' : 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    contextmenu: false,
    fontSize: 12.5
  })
  editor.onDidChangeModelContent(() => {
    content.value = editor.getValue()
  })

  if (!isNew) {
    name.value = existingEntry?.name ?? ''
    content.value = (await store.load(store.editingSnippet.id)) ?? ''
  } else if (store.editingSnippet.initialContent) {
    // Prefilled from a Tools dialog's "Add to Snippets".
    content.value = store.editingSnippet.initialContent
  }
  editor.setValue(content.value)
})

watch(content, (value) => {
  if (editor && editor.getValue() !== value) editor.setValue(value)
})
watch(language, (lang) => {
  if (editor) monaco.editor.setModelLanguage(editor.getModel(), lang)
})
watch(
  () => diff.theme,
  (theme) => monaco.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark')
)

onBeforeUnmount(() => {
  clearTimeout(clearTimer)
  editor?.dispose()
})

async function save() {
  // Guard against a fast double-click: store.add is async (IPC round trip),
  // so a second click before it resolves would create a duplicate.
  if (!name.value.trim() || saving.value) return
  saving.value = true
  // Only pass colors for tags that don't exist yet — the store registers them
  // now (first persistence of a tag happens on save, never before).
  const newColors = {}
  for (const t of tags.value)
    if (!store.colorOf(t) && tentativeColors.value[t]) newColors[t] = tentativeColors.value[t]
  if (isNew) {
    await store.add(name.value, content.value, chosenLanguage.value, tags.value, newColors)
  } else {
    await store.update(
      store.editingSnippet.id,
      name.value,
      content.value,
      chosenLanguage.value,
      tags.value,
      newColors
    )
  }
  close()
}

function close() {
  store.editingSnippet = null
}

async function copyContent() {
  if (!content.value) return
  await navigator.clipboard.writeText(content.value)
  diff.showNotice('Copied snippet to clipboard.')
}

// Clear the editor — handy for wiping pasted content before it's saved. Clearing
// can discard a lot of typing, so it's a two-step confirm: the first click arms
// the button, a second within 3 s actually clears (auto-disarms otherwise).
const clearArmed = ref(false)
let clearTimer = null
function clearContent() {
  if (!content.value) return
  if (!clearArmed.value) {
    clearArmed.value = true
    clearTimer = setTimeout(() => (clearArmed.value = false), 3000)
    return
  }
  clearTimeout(clearTimer)
  clearArmed.value = false
  content.value = ''
  editor?.setValue('')
  editor?.focus()
}

// Pretty-print the content when the snippet's syntax is one we can format
// (JSON / XML / SQL). Uses the same formatters as the Tools menu; invalid JSON
// is reported rather than mangled.
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

// Dropping a file onto the editor loads its contents (handled here, with
// capture + stop, so the window-level diff drop handler never sees it).
async function onDropFile(e) {
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  const path = window.api.getPathForFile(file)
  if (!path) return
  const res = await window.api.readFile(path)
  if (res && !res.error && res.content != null) {
    content.value = res.content
    if (!name.value.trim()) name.value = res.name
  }
}
</script>

<template>
  <div class="backdrop">
    <div class="dialog">
      <div class="dialog-header">
        <h3>{{ isNew ? 'New Snippet' : 'Edit Snippet' }}</h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>
      <div class="fields">
        <label class="grow">
          Name
          <input v-model="name" type="text" spellcheck="false" placeholder="Snippet name…" />
        </label>
      </div>
      <div class="tag-section">
        <div class="field-label">
          Tags <span class="hint">— up to {{ MAX_TAGS }}, or leave empty for Default</span>
        </div>
        <div class="tagfield" @click="tagInputEl?.focus()">
          <span v-for="t in tags" :key="t" class="etag" :style="{ '--tc': colorFor(t) }">
            <TagGlyph :color="colorFor(t)" />{{ t }}
            <button type="button" class="x" @click.stop="removeTag(t)">×</button>
          </span>
          <input
            ref="tagInputEl"
            v-model="tagInput"
            class="taginput"
            :placeholder="canAddMore ? 'add a tag…' : ''"
            :disabled="!canAddMore"
            spellcheck="false"
            @keydown="onTagKey"
          />
        </div>
        <div class="cap" :class="{ full: !canAddMore }">
          {{ tags.length }} of {{ MAX_TAGS }}{{ canAddMore ? '' : ' — remove one to add another' }}
        </div>
        <div v-if="suggestions.length && canAddMore" class="suggest">
          <button
            v-for="s in suggestions"
            :key="s"
            type="button"
            class="sugg"
            :style="{ '--tc': store.colorOf(s) }"
            @click="addTag(s)"
          >
            <TagGlyph :color="store.colorOf(s)" />{{ s }}
          </button>
        </div>
      </div>
      <div class="editor-header">
        <span>Content <span class="drop-hint">— or drop a file here</span></span>
        <label class="lang-picker">
          Syntax
          <select v-model="chosenLanguage">
            <option v-for="l in languages" :key="l.id" :value="l.id">{{ l.label }}</option>
          </select>
          <span v-if="chosenLanguage === 'auto'" class="lang-detected">→ {{ language }}</span>
        </label>
      </div>
      <div
        ref="container"
        class="editor"
        @dragover.capture.prevent.stop
        @drop.capture.prevent.stop="onDropFile"
      ></div>
      <div v-if="isMermaid" class="mmd-preview">
        <div class="mmd-preview-head">
          <span>Diagram preview</span>
          <button
            type="button"
            class="ghost small"
            :disabled="!content.trim()"
            title="Open the full, resizable diagram viewer"
            @click="expandDiagram"
          >
            ⤢ Expand
          </button>
        </div>
        <div class="mmd-preview-body">
          <MermaidDiagram :code="content" />
        </div>
      </div>
      <div class="actions">
        <button
          class="ghost small"
          :disabled="!canFormat"
          :title="
            canFormat
              ? `Pretty-print as ${language.toUpperCase()}`
              : 'Formatting is available for JSON, XML, or SQL'
          "
          @click="formatContent"
        >
          Format
        </button>
        <button class="ghost small" :disabled="!content" title="Copy content" @click="copyContent">
          Copy
        </button>
        <button
          class="ghost small"
          :class="{ armed: clearArmed }"
          :disabled="!content"
          :title="
            clearArmed
              ? 'Click again to clear the editor'
              : 'Clear the editor (e.g. remove pasted content)'
          "
          @click="clearContent"
        >
          {{ clearArmed ? 'Confirm clear' : 'Clear' }}
        </button>
        <span class="spacer" />
        <button class="primary" :disabled="!name.trim() || saving" @click="save">Save</button>
        <button class="ghost" @click="close">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  width: 560px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
h3 {
  margin: 0;
  font-size: 14px;
}
.close-x {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 20px;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
}
.close-x:hover {
  color: var(--text);
}
.fields {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.fields .grow {
  flex: 1;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
input,
select {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 13px;
}
input:focus,
select:focus {
  outline: none;
  border-color: var(--accent);
}
.tag-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 12px;
  color: var(--text-dim);
}
.field-label .hint {
  color: var(--text-hint);
}
.tagfield {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px;
  min-height: 40px;
  cursor: text;
}
.etag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1;
  padding: 4px 6px 4px 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tc) 45%, transparent);
  background: color-mix(in srgb, var(--tc) 16%, transparent);
  color: color-mix(in srgb, var(--tc) 74%, var(--text));
}
.etag .x {
  cursor: pointer;
  opacity: 0.7;
  font-weight: 700;
  padding: 0 1px;
  background: none;
  border: none;
  color: inherit;
  font-size: 13px;
  line-height: 1;
}
.etag .x:hover {
  opacity: 1;
}
.taginput {
  border: none;
  background: none;
  color: var(--text);
  font-size: 12.5px;
  padding: 4px;
  min-width: 90px;
  flex: 1;
  font-family: inherit;
}
.taginput:focus {
  outline: none;
}
.cap {
  font-size: 11.5px;
  color: var(--text-hint);
}
.cap.full {
  color: #d29922;
}
.suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sugg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tc) 45%, transparent);
  background: color-mix(in srgb, var(--tc) 12%, transparent);
  color: color-mix(in srgb, var(--tc) 72%, var(--text));
  font-family: inherit;
}
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-dim);
}
.drop-hint {
  color: var(--text-hint);
  font-size: 11px;
}
.lang-picker {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.lang-picker select {
  padding: 2px 6px;
  font-size: 12px;
}
.lang-detected {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  color: var(--text-hint);
}
.editor {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  height: 280px;
}
.mmd-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.mmd-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 6px 10px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-dim);
}
.mmd-preview-body {
  height: 180px;
  padding: 8px;
  overflow: auto;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}
.spacer {
  flex: 1;
}
.ghost.small {
  padding: 4px 10px;
  font-size: 12px;
}
/* Armed clear: a danger cue so the second, destructive click is deliberate. */
.ghost.small.armed {
  border-color: var(--danger-border);
  color: var(--danger-bg);
  font-weight: 600;
}
.primary {
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 600;
}
.primary:disabled {
  opacity: 0.4;
  cursor: default;
}
.ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 12px;
  cursor: pointer;
}
</style>
