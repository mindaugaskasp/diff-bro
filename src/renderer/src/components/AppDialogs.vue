<script setup>
// Every modal in the app, mounted in one place. They are siblings by design:
// each is driven by its own piece of store state, so opening one never depends
// on where the trigger lives in the component tree.
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useVaultStore } from '../stores/vaultStore'
import SaveDiffDialog from './SaveDiffDialog.vue'
import ShareDiffDialog from './ShareDiffDialog.vue'
import ReplaceDiffDialog from './ReplaceDiffDialog.vue'
import Base64Dialog from './Base64Dialog.vue'
import TextToolDialog from './TextToolDialog.vue'
import EncryptDecryptDialog from './EncryptDecryptDialog.vue'
import SnippetEditorDialog from './SnippetEditorDialog.vue'
import SnippetPassphraseDialog from './SnippetPassphraseDialog.vue'
import SnippetDeleteDialog from './SnippetDeleteDialog.vue'
import VaultCategoryDeleteDialog from './VaultCategoryDeleteDialog.vue'
import AddTrustedKeyDialog from './AddTrustedKeyDialog.vue'
import TrustedKeysDialog from './TrustedKeysDialog.vue'
import ShareKeyDialog from './ShareKeyDialog.vue'
import ConfigBackupDialog from './ConfigBackupDialog.vue'
import SettingsDialog from './SettingsDialog.vue'
import MermaidViewerDialog from './MermaidViewerDialog.vue'

const store = useDiffStore()
const snippets = useSnippetStore()
const vault = useVaultStore()
</script>

<template>
  <SaveDiffDialog v-if="store.showSaveDialog" />
  <ReplaceDiffDialog v-if="store.pendingReplace" />
  <ShareDiffDialog v-if="store.shareEntryId" />
  <TrustedKeysDialog v-if="store.showTrustedKeysDialog" />
  <ShareKeyDialog v-if="store.showShareKeyDialog" />
  <ConfigBackupDialog v-if="store.configMode" />
  <SettingsDialog v-if="store.showSettingsDialog" />
  <MermaidViewerDialog v-if="store.mermaidView" />
  <AddTrustedKeyDialog v-if="store.pendingTrustedKey" />
  <Base64Dialog v-if="store.showBase64Dialog" />
  <TextToolDialog v-if="store.textTool" :key="store.textTool" :tool="store.textTool" />
  <EncryptDecryptDialog v-if="store.showCryptDialog" />
  <SnippetEditorDialog v-if="snippets.editingSnippet" />
  <SnippetPassphraseDialog v-if="snippets.pendingExport || snippets.pendingImport" />
  <SnippetDeleteDialog v-if="snippets.pendingDelete" />
  <VaultCategoryDeleteDialog v-if="vault.pendingDelete" />
</template>
