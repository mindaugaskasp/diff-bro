<script setup>
// Every modal, mounted in one place; each is driven by its own store state.
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useVaultStore } from '../stores/vaultStore'
import { useErrorStore } from '../stores/errorStore'
import ErrorReportDialog from './ErrorReportDialog.vue'
import PasteConfirmDialog from './PasteConfirmDialog.vue'
import SaveDiffDialog from './SaveDiffDialog.vue'
import ShareDiffDialog from './ShareDiffDialog.vue'
import ReplaceDiffDialog from './ReplaceDiffDialog.vue'
import Base64Dialog from './Base64Dialog.vue'
import TextToolDialog from './TextToolDialog.vue'
import FindReplaceDialog from './FindReplaceDialog.vue'
import EncryptDecryptDialog from './EncryptDecryptDialog.vue'
import SnippetEditorDialog from './SnippetEditorDialog.vue'
import SnippetPassphraseDialog from './SnippetPassphraseDialog.vue'
import SnippetDeleteDialog from './SnippetDeleteDialog.vue'
import SnippetFillDialog from './SnippetFillDialog.vue'
import VaultCategoryDeleteDialog from './VaultCategoryDeleteDialog.vue'
import AddTrustedKeyDialog from './AddTrustedKeyDialog.vue'
import TrustedKeysDialog from './TrustedKeysDialog.vue'
import RemoveTrustedKeyDialog from './RemoveTrustedKeyDialog.vue'
import ShareKeyDialog from './ShareKeyDialog.vue'
import ConfigBackupDialog from './ConfigBackupDialog.vue'
import SettingsDialog from './SettingsDialog.vue'
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog.vue'
import MermaidViewerDialog from './MermaidViewerDialog.vue'
import CommandPalette from './CommandPalette.vue'

const store = useDiffStore()
const snippets = useSnippetStore()
const vault = useVaultStore()
const errors = useErrorStore()
</script>

<template>
  <SaveDiffDialog v-if="store.showSaveDialog" />
  <ReplaceDiffDialog v-if="store.pendingReplace || store.pendingPick" />
  <ShareDiffDialog v-if="store.shareEntryId" />
  <TrustedKeysDialog v-if="store.showTrustedKeysDialog" />
  <RemoveTrustedKeyDialog v-if="store.pendingUntrust" />
  <ShareKeyDialog v-if="store.showShareKeyDialog" />
  <ConfigBackupDialog v-if="store.configMode" />
  <SettingsDialog v-if="store.showSettingsDialog" />
  <KeyboardShortcutsDialog v-if="store.showShortcutsDialog" />
  <CommandPalette v-if="store.showCommandPalette" />
  <MermaidViewerDialog v-if="store.mermaidView" />
  <AddTrustedKeyDialog v-if="store.pendingTrustedKey" />
  <Base64Dialog v-if="store.showBase64Dialog" />
  <TextToolDialog v-if="store.textTool" :key="store.textTool" :tool="store.textTool" />
  <FindReplaceDialog v-if="store.showFindReplaceDialog" />
  <EncryptDecryptDialog v-if="store.showCryptDialog" />
  <SnippetEditorDialog v-if="snippets.editingSnippet" />
  <SnippetPassphraseDialog v-if="snippets.pendingExport || snippets.pendingImport" />
  <SnippetDeleteDialog v-if="snippets.pendingDelete" />
  <SnippetFillDialog v-if="snippets.pendingFill" />
  <VaultCategoryDeleteDialog v-if="vault.pendingDelete" />
  <ErrorReportDialog v-if="errors.visible" />
  <PasteConfirmDialog v-if="store.pastePrompt" />
</template>
