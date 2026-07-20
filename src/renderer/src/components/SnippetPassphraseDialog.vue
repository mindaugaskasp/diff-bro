<script setup>
import { computed, ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { PASSPHRASE_HINT, passphraseTooShort } from '../passphrase'

const store = useSnippetStore()
const diff = useDiffStore()
const passphrase = ref('')
const busy = ref(false)

const mode = computed(() => (store.pendingImport ? 'import' : 'export'))
const exportAll = computed(() => store.pendingExport?.categoryId === 'all')
const exportCategoryName = computed(
  () => store.categories.find((c) => c.id === store.pendingExport?.categoryId)?.name
)

async function submit() {
  if (!passphrase.value || busy.value) return
  // Enforce a minimum only when creating a file; import must accept whatever
  // the file was made with.
  if (mode.value === 'export' && passphraseTooShort(passphrase.value)) {
    diff.showNotice(PASSPHRASE_HINT)
    return
  }
  busy.value = true
  try {
    if (mode.value === 'import') {
      const res = await store.importSnippets(passphrase.value)
      if (!res.canceled) {
        diff.showNotice(res.ok ? `Snippets imported. ${res.signerNote ?? ''}`.trim() : res.message)
      }
    } else {
      const res = exportAll.value
        ? await store.exportAll(passphrase.value)
        : await store.exportCategory(store.pendingExport.categoryId, passphrase.value)
      if (!res.canceled) diff.showNotice(res.ok ? `Exported to ${res.path}` : 'Export failed.')
    }
    close()
  } finally {
    busy.value = false
  }
}

function close() {
  store.pendingExport = null
  store.pendingImport = false
  passphrase.value = ''
}
</script>

<template>
  <div class="backdrop">
    <form class="dialog" @submit.prevent="submit">
      <div class="dialog-header">
        <h3>
          {{
            mode === 'import'
              ? 'Import Snippets'
              : exportAll
                ? 'Export All Snippets'
                : `Export "${exportCategoryName}"`
          }}
        </h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>
      <p class="note">
        {{
          mode === 'import'
            ? 'Enter the passphrase this file was exported with.'
            : "Choose a passphrase. You'll need it again to reimport this file."
        }}
      </p>
      <label>
        Passphrase
        <input
          v-model="passphrase"
          type="password"
          autocomplete="off"
          spellcheck="false"
          autofocus
        />
      </label>
      <div class="actions">
        <button type="submit" class="primary" :disabled="!passphrase || busy">
          {{ mode === 'import' ? 'Import' : 'Export' }}
        </button>
        <button type="button" class="ghost" @click="close">Cancel</button>
      </div>
    </form>
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
  width: 360px;
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
.note {
  margin: 0;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.4;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 13px;
}
input:focus {
  outline: none;
  border-color: var(--accent);
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
