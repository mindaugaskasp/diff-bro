// Resolves the stores the registry's handlers ask for. The only place that
// knows both, which is what keeps utils/commands.js pure and the stores
// unaware of each other.

import { runCliCommand, runCommand } from '../utils/commands'
import { useDiffStore } from '../stores/diffStore'
import { useTabsStore } from '../stores/tabsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useConfigBackupStore } from '../features/configBackup'
import { useImageExportStore } from '../features/imageExport'
import { useShareStore } from '../features/share'
import { useOnboardingStore } from '../features/onboarding'

const bundle = () => ({
  diff: useDiffStore(),
  tabs: useTabsStore(),
  settings: useSettingsStore(),
  ui: useUiStore(),
  snippets: useSnippetStore(),
  configBackup: useConfigBackupStore(),
  imageExport: useImageExportStore(),
  share: useShareStore(),
  onboarding: useOnboardingStore()
})

export function useCommands() {
  const run = (action) => runCommand(action, bundle())
  return {
    run,
    // Menus, the in-app bar and the palette all come through here. While the
    // tour is running they are ignored: the veil takes every click, but the OS
    // menu sits outside the window and was the one way to open a dialog the
    // tour then covered. The tour's own dispatch uses `run` directly.
    runFromMenu: (action) => !useOnboardingStore().active && run(action),
    runCli: (command) => runCliCommand(command, bundle())
  }
}
