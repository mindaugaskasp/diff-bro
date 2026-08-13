<script setup>
// Every modal, mounted in one place; each is driven by its own store state.
import { useDiffStore } from '../stores/diffStore'
import { DiffImageDialog, useImageExportStore } from '../features/imageExport'
import { useSnippetStore } from '../stores/snippetStore'
import { useVaultStore } from '../stores/vaultStore'
import { useTabsStore } from '../stores/tabsStore'
import { useErrorStore } from '../stores/errorStore'
import ErrorReportDialog from './ErrorReportDialog.vue'
import { PasteConfirmDialog, usePasteToCompareStore } from '../features/pasteToCompare'
import CliBlockedDialog from './CliBlockedDialog.vue'
import SaveDiffDialog from './SaveDiffDialog.vue'
import ReplaceDiffDialog from './ReplaceDiffDialog.vue'
import TextToolDialog from './TextToolDialog.vue'
import EncryptDecryptDialog from './EncryptDecryptDialog.vue'
import SnippetEditorDialog from './SnippetEditorDialog.vue'
import SnippetHistoryDialog from './SnippetHistoryDialog.vue'
import SnippetColorMenu from './SnippetColorMenu.vue'
import SnippetPassphraseDialog from './SnippetPassphraseDialog.vue'
import SnippetDeleteDialog from './SnippetDeleteDialog.vue'
import SnippetFillDialog from './SnippetFillDialog.vue'
import VaultCategoryDeleteDialog from './VaultCategoryDeleteDialog.vue'
import RetagDiffDialog from './RetagDiffDialog.vue'
import TabCloseDialog from './TabCloseDialog.vue'
import TabEvictDialog from './TabEvictDialog.vue'
import { ConfigBackupDialog, useConfigBackupStore } from '../features/configBackup'
import SettingsDialog from './SettingsDialog.vue'
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog.vue'
import MermaidViewerDialog from './MermaidViewerDialog.vue'
import CommandPalette from './CommandPalette.vue'
import {
  AddTrustedKeyDialog,
  RemoveTrustedKeyDialog,
  RotateKeyDialog,
  ShareDiffDialog,
  ShareKeyDialog,
  TrustedKeysDialog,
  useShareStore
} from '../features/share'
import { EmailHandoffDialog, useEmailStore } from '../features/email'
import { ConflictsDialog, useConflictsStore } from '../features/merge'
import { useUiStore } from '../stores/uiStore'

const store = useDiffStore()

const ui = useUiStore()
const share = useShareStore()
const email = useEmailStore()
const imageExport = useImageExportStore()
const configBackup = useConfigBackupStore()
const tabs = useTabsStore()
const paste = usePasteToCompareStore()
const snippets = useSnippetStore()
const vault = useVaultStore()
const errors = useErrorStore()
const conflicts = useConflictsStore()
</script>

<template>
  <SaveDiffDialog v-if="store.showSaveDialog" />
  <ReplaceDiffDialog v-if="store.pendingReplace || store.pendingPick" />
  <ShareDiffDialog v-if="share.shareEntryId || share.shareDraft" />
  <EmailHandoffDialog v-if="email.draft" />
  <DiffImageDialog v-if="imageExport.imageEntry" />
  <TrustedKeysDialog v-if="share.showTrustedKeysDialog" />
  <RemoveTrustedKeyDialog v-if="share.pendingUntrust" />
  <ShareKeyDialog v-if="share.showShareKeyDialog" />
  <RotateKeyDialog v-if="share.showRotateKeyDialog" />
  <ConfigBackupDialog v-if="configBackup.mode" />
  <SettingsDialog v-if="ui.showSettingsDialog" />
  <KeyboardShortcutsDialog v-if="ui.showShortcutsDialog" />
  <CommandPalette v-if="ui.showCommandPalette" />
  <MermaidViewerDialog v-if="ui.mermaidView" />
  <AddTrustedKeyDialog v-if="share.pendingTrustedKey" />
  <TextToolDialog v-if="ui.textTool" :key="ui.textTool" :tool="ui.textTool" />
  <EncryptDecryptDialog v-if="ui.showCryptDialog" />
  <SnippetEditorDialog v-if="snippets.editingSnippet" />
  <SnippetHistoryDialog v-if="ui.snippetHistory" />
  <SnippetColorMenu v-if="ui.rowColorMenu" />
  <SnippetPassphraseDialog v-if="snippets.pendingExport || snippets.pendingImport" />
  <SnippetDeleteDialog v-if="snippets.pendingDelete" />
  <SnippetFillDialog v-if="snippets.pendingFill" />
  <VaultCategoryDeleteDialog v-if="vault.pendingDelete" />
  <RetagDiffDialog v-if="vault.pendingRetag" />
  <TabCloseDialog v-if="tabs.pendingClose" />
  <TabEvictDialog v-if="tabs.pendingEvict" />
  <ErrorReportDialog v-if="errors.visible" />
  <PasteConfirmDialog v-if="paste.prompt" />
  <CliBlockedDialog v-if="store.cliBlocked" />
  <ConflictsDialog v-if="conflicts.open" />
</template>
