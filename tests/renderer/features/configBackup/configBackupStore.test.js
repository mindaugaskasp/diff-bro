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

// A backup is only worth having if restoring it puts you back where you were.
// It carried the THEME and nothing else — every limit, toggle, shortcut and
// ordering the reader had set was lost, silently, on a new machine.
describe('what the archive carries', () => {
  it('takes every setting, not just the theme', async () => {
    const settings = useSettingsStore()
    settings.setTheme('nord')
    settings.setLimit('tagShelfRows', 7)
    settings.setAutoCloseOldest(true)
    settings.setShutterSound(false)

    const bundle = await useConfigBackupStore()._bundle()
    expect(bundle.settings.theme).toBe('nord')
    expect(bundle.settings.tagShelfRows).toBe(7)
    expect(bundle.settings.autoCloseOldest).toBe(true)
    expect(bundle.settings.shutterSound).toBe(false)
  })

  it('takes the open comparisons', async () => {
    savePersisted('session', '{"version":1,"tabs":[]}')
    expect((await useConfigBackupStore()._bundle()).session).toBe('{"version":1,"tabs":[]}')
  })

  // The sidebar's own arrangement lives in the settings blob too.
  it('takes the sidebar order the reader dragged into place', async () => {
    const settings = useSettingsStore()
    settings.sectionOrder = ['snippets', 'saved', 'external', 'tools']
    settings.persist()
    expect((await useConfigBackupStore()._bundle()).settings.sectionOrder).toEqual([
      'snippets',
      'saved',
      'external',
      'tools'
    ])
  })
})

// The round trip is the point: what comes out has to put you back where you
// were, on a machine that has never seen your settings.
describe('restoring an archive', () => {
  it('puts every setting back, not just the theme', async () => {
    const settings = useSettingsStore()
    settings.setTheme('nord')
    settings.setLimit('tagShelfRows', 9)
    settings.setAutoCloseOldest(true)
    settings.setShutterSound(false)
    settings.sectionOrder = ['tools', 'snippets', 'saved', 'external']
    settings.persist()
    const archived = await useConfigBackupStore()._bundle()

    // A fresh machine: nothing configured.
    setActivePinia(createPinia())
    localStorage.clear()
    const fresh = useSettingsStore()
    expect(fresh.tagShelfRows).toBe(2)
    expect(fresh.autoCloseOldest).toBe(false)

    fresh.restoreState(archived.settings)
    expect(fresh.userTheme).toBe('nord')
    expect(fresh.tagShelfRows).toBe(9)
    expect(fresh.autoCloseOldest).toBe(true)
    expect(fresh.shutterSound).toBe(false)
    expect(fresh.sectionOrder).toEqual(['tools', 'snippets', 'saved', 'external'])
  })

  it('survives the reload after it, so the restore is not just in memory', async () => {
    const settings = useSettingsStore()
    settings.setLimit('maxSnippetSizeKb', 512)
    const archived = await useConfigBackupStore()._bundle()

    setActivePinia(createPinia())
    localStorage.clear()
    useSettingsStore().restoreState(archived.settings)

    setActivePinia(createPinia())
    expect(useSettingsStore().maxSnippetSizeKb).toBe(512)
  })

  it('ignores a bundle whose settings are not an object', () => {
    const settings = useSettingsStore()
    settings.setTheme('nord')
    for (const bad of [null, undefined, 'nope', 42]) settings.restoreState(bad)
    expect(settings.userTheme).toBe('nord')
  })
})
