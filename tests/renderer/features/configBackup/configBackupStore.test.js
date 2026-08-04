// Backing up and restoring the whole configuration. The notices land on the
// core store, which is the one thing this slice reaches for.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigBackupStore } from '../../../../src/renderer/src/features/configBackup'
import { useDiffStore } from '../../../../src/renderer/src/stores/diffStore'
import { useSettingsStore } from '../../../../src/renderer/src/stores/settingsStore'
import { loadPersisted, savePersisted } from '../../../../src/renderer/src/persist'

const diff = () => useDiffStore()

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

describe('configBackupStore', () => {
  it('config backup reports where the file went, and names the failure otherwise', async () => {
    const store = useConfigBackupStore()
    window.api = { backupConfig: async () => ({ ok: true, path: '/tmp/cfg.diffbroconf' }) }
    await store.run('passphrase')
    expect(diff().notice).toContain('/tmp/cfg.diffbroconf')

    window.api = { backupConfig: async () => ({ error: 'nope' }) }
    await store.run('passphrase')
    expect(diff().notice).toBe('Backup failed.')

    window.api = { backupConfig: async () => ({ canceled: true }) }
    diff().notice = null
    await store.run('passphrase')
    expect(diff().notice).toBeNull()
  })
  it('config restore applies the backed-up theme and distinguishes a wrong passphrase', async () => {
    const store = useConfigBackupStore()
    expect(useSettingsStore().theme).toBe('light')
    window.api = {
      restoreConfig: async () => ({ ok: true, snippets: null, settings: { theme: 'neon' } })
    }
    await store.restore('passphrase')
    expect(useSettingsStore().theme).toBe('neon')
    expect(diff().notice).toContain('Configuration restored')

    window.api = { restoreConfig: async () => ({ error: 'wrong-passphrase' }) }
    await store.restore('nope')
    expect(diff().notice).toContain('Wrong passphrase')

    window.api = { restoreConfig: async () => ({ error: 'not-a-config-file' }) }
    await store.restore('nope')
    expect(diff().notice).toContain('not a Diff Bro configuration backup')
  })

  it('opens and closes, dropping a destination the CLI handed over', () => {
    const store = useConfigBackupStore()
    store.pendingPath = '/tmp/out.diffbroconf'
    store.open('backup')
    expect(store.mode).toBe('backup')
    store.close()
    expect(store.mode).toBeNull()
    expect(store.pendingPath).toBeNull()
  })
})

describe('config backup — session round trip', () => {
  it('collects the session into the bundle and writes it back on restore', async () => {
    const store = useConfigBackupStore()
    savePersisted('session', '{"tabs":["a"]}')
    let sent = null
    window.api.backupConfig = async (bundle) => {
      sent = bundle
      return { ok: true, path: '/tmp/x' }
    }
    await store.run('passphrase-long-enough')
    expect(sent.session).toBe('{"tabs":["a"]}')

    savePersisted('session', '{"tabs":["different"]}')
    window.api.restoreConfig = async () => ({ ok: true, session: sent.session })
    await store.restore('passphrase-long-enough')
    // Written to persistence, not applied live: replacing the comparisons the
    // reader is looking at mid-restore is not what they asked for.
    expect(loadPersisted('session')).toBe('{"tabs":["a"]}')
  })
})
