<script setup>
import { computed, ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { PASSPHRASE_HINT, passphraseTooShort } from '../passphrase'
import BaseDialog from './BaseDialog.vue'
import { t } from '../i18n'

const store = useSnippetStore()
const diff = useDiffStore()
const passphrase = ref('')
const busy = ref(false)

const mode = computed(() => (store.pendingImport ? 'import' : 'export'))
const exportAll = computed(() => store.pendingExport?.all === true)
const exportTagName = computed(() => store.pendingExport?.tag || 'Default')
const title = computed(() => {
  if (mode.value === 'import') return t('snippetPassphraseDialog.importTitle')
  return exportAll.value
    ? t('snippetPassphraseDialog.exportAllTitle')
    : t('snippetPassphraseDialog.exportTagTitle', { tag: exportTagName.value })
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
  diff.showNotice(
    res.ok
      ? t('snippetPassphraseDialog.exportedTo', { path: res.path })
      : t('snippetPassphraseDialog.exportFailed')
  )
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
            ? $t('snippetPassphraseDialog.enterExisting')
            : $t('snippetPassphraseDialog.chooseNew')
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
          {{
            mode === 'import'
              ? $t('snippetPassphraseDialog.import')
              : $t('snippetPassphraseDialog.export')
          }}
        </button>
        <button type="button" class="btn btn-ghost" @click="close">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
<style scoped src="./styles/SnippetPassphraseDialog.css"></style>
