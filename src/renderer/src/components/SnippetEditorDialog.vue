<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { detectSnippetLanguage, SNIPPET_LANGUAGES } from '../utils/detectLanguage'

const store = useSnippetStore()
const diff = useDiffStore()
const container = ref(null)
const name = ref('')
const content = ref('')
const isNew = store.editingSnippet.id == null
const saving = ref(false)
let editor = null

// New snippets default to the category they were launched from, falling
// back to Default; editing a snippet preloads its current category, and
// changing this selector moves it.
const existingEntry = isNew ? null : store.entries.find((e) => e.id === store.editingSnippet.id)
const categoryId = ref(
  isNew
    ? (store.editingSnippet.categoryId ?? store.defaultCategoryId)
    : (existingEntry?.categoryId ?? store.defaultCategoryId)
)

const languages = SNIPPET_LANGUAGES
// 'auto' defers to the content-based detector; any other value is the
// user's explicit syntax choice, remembered with the snippet.
const chosenLanguage = ref(
  existingEntry?.language || store.editingSnippet.initialLanguage || 'auto'
)
const language = computed(() =>
  chosenLanguage.value === 'auto' ? detectSnippetLanguage(content.value) : chosenLanguage.value
)

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
  editor?.dispose()
})

async function save() {
  // Guard against a fast double-click: store.add is async (IPC round trip),
  // so a second click before it resolves would create a duplicate.
  if (!name.value.trim() || saving.value) return
  saving.value = true
  if (isNew) {
    await store.add(categoryId.value, name.value, content.value, chosenLanguage.value)
  } else {
    await store.update(
      store.editingSnippet.id,
      name.value,
      content.value,
      categoryId.value,
      chosenLanguage.value
    )
  }
  close()
}

function close() {
  store.editingSnippet = null
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
        <label>
          Category
          <select v-model="categoryId">
            <option v-for="c in store.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
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
      <div class="actions">
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
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
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
