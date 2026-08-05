<script setup>
import { computed, ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { PASSPHRASE_HINT, passphraseTooShort } from '../passphrase'
import BaseDialog from './BaseDialog.vue'

const store = useSnippetStore()
const diff = useDiffStore()
const passphrase = ref('')
const busy = ref(false)

const mode = computed(() => (store.pendingImport ? 'import' : 'export'))
const exportAll = computed(() => store.pendingExport?.all === true)
const exportTagName = computed(() => store.pendingExport?.tag || 'Default')
const title = computed(() => {
  if (mode.value === 'import') return 'Import Snippets'
  return exportAll.value ? 'Export All Snippets' : `Export "${exportTagName.value}" tag`
})

async function runImport() {
  const res = await store.importSnippets(passphrase.value)
  if (res.canceled) return
  diff.showNotice(res.ok ? `Snippets imported. ${res.signerNote ?? ''}`.trim() : res.message)
}

async function runExport() {
  const res = exportAll.value
    ? await store.exportAll(passphrase.value)
    : await store.exportTag(store.pendingExport.tag, passphrase.value)
  if (res.canceled) return
  diff.showNotice(res.ok ? `Exported to ${res.path}` : 'Export failed.')
}

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
    await (mode.value === 'import' ? runImport() : runExport())
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
  <BaseDialog width="360px" :title="title" @close="close">
    <form class="dialog-form" @submit.prevent="submit">
      <p class="dialog-note">
        {{
          mode === 'import'
            ? 'Enter the passphrase this file was exported with.'
            : "Choose a passphrase. You'll need it again to reimport this file."
        }}
      </p>
      <label>
        {{ $t('snippetPassphraseDialog.passphrase') }}
        <input
          v-model="passphrase"
          type="password"
          autocomplete="off"
          spellcheck="false"
          autofocus
        />
      </label>
      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary" :disabled="!passphrase || busy">
          {{ mode === 'import' ? 'Import' : 'Export' }}
        </button>
        <button type="button" class="btn btn-ghost" @click="close">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
<style scoped src="./styles/SnippetPassphraseDialog.css"></style>
