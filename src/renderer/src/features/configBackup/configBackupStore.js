import { defineStore } from 'pinia'
import { useDiffStore } from '../../stores/diffStore'
import { useSnippetStore } from '../../stores/snippetStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { loadPersisted, savePersisted } from '../../persist'

const restoreError = (error) =>
  error === 'wrong-passphrase'
    ? 'Wrong passphrase, or the file is corrupted.'
    : 'That file is not a Diff Bro configuration backup.'

export const useConfigBackupStore = defineStore('configBackup', {
  state: () => ({
    // null · 'backup' · 'restore' — which half of the dialog is open.
    mode: null,
    // A destination handed over by `diffbro backup <path>`, waiting on a passphrase.
    pendingPath: null
  }),
  actions: {
    open(mode) {
      this.mode = mode
    },
    close() {
      this.mode = null
      this.pendingPath = null
    },
    // Decrypted here and re-sealed under the passphrase in main: the vault key
    // never travels, which is what makes the archive open on another machine.
    async _bundle() {
      return {
        snippets: await useSnippetStore().fullBundle(),
        vault: await useVaultStore().fullBundle(),
        // The WHOLE settings blob, not just the theme. Carrying one key meant
        // every limit, toggle, shortcut and ordering the reader had set was
        // lost on restore — silently, which is the worst way to lose it.
        settings: useSettingsStore().backupState(),
        session: loadPersisted('session')
      }
    },
    async run(passphrase) {
      const diff = useDiffStore()
      const res = await window.api.backupConfig(await this._bundle(), passphrase)
      if (res.ok) diff.showNotice(`Configuration backed up to ${res.path}`)
      else if (!res.canceled) diff.showNotice('Backup failed.')
    },
    // `diffbro backup <path>`: same seal, written where the terminal said.
    async runTo(target, passphrase) {
      const diff = useDiffStore()
      const res = await window.api.backupConfigTo(await this._bundle(), passphrase, target)
      diff.showNotice(res.ok ? `Backed up to ${res.path}` : (res.error ?? 'Backup failed.'))
      return res
    },
    async restore(passphrase) {
      const diff = useDiffStore()
      const res = await window.api.restoreConfig(passphrase)
      // A cancelled pick is `!ok` with no error, and says nothing.
      if (!res.ok) return res.error && diff.showNotice(restoreError(res.error))
      if (res.snippets) await useSnippetStore().restoreBundle(res.snippets)
      if (res.vault) await useVaultStore().restoreBundle(res.vault)
      // Persisted, not applied live: replacing the comparisons on screen
      // mid-restore is not what "restore my backup" asked for.
      if (res.session) savePersisted('session', res.session)
      if (res.settings) useSettingsStore().restoreState(res.settings)
      diff.showNotice('Configuration restored — identity keys and trusted hosts are updated.')
    }
  }
})
