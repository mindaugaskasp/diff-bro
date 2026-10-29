<script setup>
// The Snippets header's rarer actions, behind ⋯ so the header shows only + (#144).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MOD } from '../keys'
import { useSnippetStore } from '../stores/snippetStore'
import { useCommands } from '../composables/useCommands'
import ActionMenu from './ActionMenu.vue'

const { t } = useI18n()
const store = useSnippetStore()
const { run } = useCommands()

const items = computed(() => [
  {
    action: 'open',
    label: t('snippetsPanel.openFile'),
    icon: 'folder-open',
    keys: `${MOD}+O`
  },
  { action: 'export', label: t('snippetsPanel.exportAllSnippetsToA'), icon: 'arrow-up' },
  { action: 'import', label: t('snippetsPanel.importSnippetsFromAFile'), icon: 'arrow-down' }
])

const ACTIONS = {
  open: () => run('open-file-as-snippet'),
  export: () => (store.pendingExport = { all: true }),
  import: () => (store.pendingImport = true)
}
</script>

<template>
  <ActionMenu
    :label="$t('snippetsPanel.moreActions')"
    :items="items"
    trigger-class="btn btn-icon"
    @pick="ACTIONS[$event]()"
  />
</template>
