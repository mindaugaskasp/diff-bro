import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

const FILE = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })

describe('diffStore', () => {
  it('is ready only when both sides are loaded', () => {
    const store = useDiffStore()
    expect(store.ready).toBe(false)
    store.left = FILE('a.txt')
    expect(store.ready).toBe(false)
    store.right = FILE('b.txt')
    expect(store.ready).toBe(true)
  })

  it('canSave follows the active mode', () => {
    const store = useDiffStore()
    expect(store.canSave).toBe(false)
    store.mode = 'paste'
    store.pasteLeft = 'something'
    expect(store.canSave).toBe(true)
    store.mode = 'files'
    expect(store.canSave).toBe(false) // files mode needs both files
  })

  it('rejects binary files with a notice and leaves the slot unchanged', () => {
    const store = useDiffStore()
    store.receive('left', { error: 'binary', name: 'blob.bin' })
    expect(store.left).toBeNull()
    expect(store.notice).toContain('blob.bin')
  })

  it('swap exchanges the two sides', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.swap()
    expect(store.left.name).toBe('b.txt')
    expect(store.right.name).toBe('a.txt')
  })

  it('snapshot/restore roundtrips the full comparison state', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'L'
    store.pasteRight = 'R'
    store.renderSideBySide = false
    store.ignoreTrimWhitespace = true
    const snap = store.snapshot()

    store.$reset()
    store.restore(snap)
    expect(store.mode).toBe('paste')
    expect(store.pasteLeft).toBe('L')
    expect(store.pasteRight).toBe('R')
    expect(store.renderSideBySide).toBe(false)
    expect(store.ignoreTrimWhitespace).toBe(true)
  })

  it('comparePasted promotes pasted text into the diff view', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'old'
    store.pasteRight = 'new'
    store.comparePasted()
    expect(store.mode).toBe('files')
    expect(store.left.content).toBe('old')
    expect(store.right.content).toBe('new')
    expect(store.ready).toBe(true)
  })

  it('partial paste: compares pasted text against a loaded file', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'typed original'
    store.receivePasteFile('right', { name: 'changed.txt', content: 'file body' })
    expect(store.canSave).toBe(true)
    store.comparePasted()
    expect(store.mode).toBe('files')
    expect(store.left).toMatchObject({ name: 'Left (pasted)', content: 'typed original' })
    expect(store.right).toMatchObject({ name: 'changed.txt', content: 'file body' })
  })

  it('receivePasteFile rejects a binary file and keeps the side as a textarea', () => {
    const store = useDiffStore()
    store.receivePasteFile('left', { error: 'binary', name: 'blob.bin' })
    expect(store.pasteLeftFile).toBeNull()
    expect(store.notice).toContain('blob.bin')
  })

  it('clearPasteFile returns a paste side to its textarea', () => {
    const store = useDiffStore()
    store.receivePasteFile('left', { name: 'a.txt', content: 'x' })
    expect(store.pasteLeftFile).not.toBeNull()
    store.clearPasteFile('left')
    expect(store.pasteLeftFile).toBeNull()
  })

  it('pastePickFile loads the chosen file into one side', async () => {
    const store = useDiffStore()
    window.api.openFile = async (side) => ({ name: `${side}.txt`, content: 'picked' })
    await store.pastePickFile('right')
    expect(store.pasteRightFile).toEqual({ name: 'right.txt', content: 'picked' })
  })

  it('dropFiles loads two dropped files into left and right', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({
      path,
      name: path.split('/').pop(),
      content: `c:${path}`
    })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    expect(store.left.name).toBe('a.txt')
    expect(store.right.name).toBe('b.txt')
    expect(store.ready).toBe(true)
  })

  it('dropFiles with one file fills the first empty side (left, then right)', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/first.txt'])
    expect(store.left.name).toBe('first.txt')
    expect(store.right).toBeNull()
    await store.dropFiles(['/tmp/second.txt'])
    expect(store.right.name).toBe('second.txt')
  })

  it('dropFiles targets a specific slot when a side is given', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/only.txt'], 'right')
    expect(store.right.name).toBe('only.txt')
    expect(store.left).toBeNull()
  })

  it('dropFiles: a third single file prompts before replacing a complete diff', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    expect(store.ready).toBe(true)
    await store.dropFiles(['/tmp/c.txt']) // third file -> confirmation, not silent replace
    expect(store.pendingReplace).toEqual(['/tmp/c.txt'])
    expect(store.left.name).toBe('a.txt') // still the old diff until confirmed
    await store.confirmReplace()
    expect(store.left.name).toBe('c.txt')
    expect(store.right).toBeNull()
  })

  it('dropFiles: dropping two files onto a complete diff also prompts, then fills both', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    await store.dropFiles(['/tmp/c.txt', '/tmp/d.txt'])
    expect(store.pendingReplace).toEqual(['/tmp/c.txt', '/tmp/d.txt'])
    expect(store.left.name).toBe('a.txt')
    await store.confirmReplace()
    expect(store.left.name).toBe('c.txt')
    expect(store.right.name).toBe('d.txt')
  })

  it('dropFiles onto a specific slot replaces just that side without prompting', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    await store.dropFiles(['/tmp/new.txt'], 'left')
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('new.txt')
    expect(store.right.name).toBe('b.txt')
  })

  it('cancelReplace drops the pending replacement, keeping the current diff', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    await store.dropFiles(['/tmp/c.txt'])
    store.cancelReplace()
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('a.txt')
    expect(store.right.name).toBe('b.txt')
  })

  it('clear wipes loaded files and paste-mode text', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.pasteLeft = 'lingering left'
    store.pasteRight = 'lingering right'
    store.clear()
    expect(store.left).toBeNull()
    expect(store.right).toBeNull()
    expect(store.pasteLeft).toBe('')
    expect(store.pasteRight).toBe('')
  })

  it('routes menu actions: toggle-split flips the view option', () => {
    const store = useDiffStore()
    const before = store.renderSideBySide
    store.handleMenuAction('toggle-split')
    expect(store.renderSideBySide).toBe(!before)
  })

  it('only opens the save dialog when there is something to save', () => {
    const store = useDiffStore()
    store.handleMenuAction('save')
    expect(store.showSaveDialog).toBe(false)
    store.mode = 'paste'
    store.pasteLeft = 'x'
    store.handleMenuAction('save')
    expect(store.showSaveDialog).toBe(true)
  })

  it('shareCurrent explains itself instead of opening dialogs on an empty app', () => {
    const store = useDiffStore()
    store.shareCurrent()
    expect(store.showSaveDialog).toBe(false)
    expect(store.saveThenShare).toBe(false)
    expect(store.notice).toContain('Nothing to share')
  })

  it('shareCurrent chains save → share when a diff is present', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'x'
    store.shareCurrent()
    expect(store.showSaveDialog).toBe(true)
    expect(store.saveThenShare).toBe(true)
  })

  it('routes menu actions: tools-base64, tools-json, tools-xml, tools-crypt open their dialogs', () => {
    const store = useDiffStore()
    store.handleMenuAction('tools-base64')
    expect(store.showBase64Dialog).toBe(true)
    store.handleMenuAction('tools-json')
    expect(store.textTool).toBe('json')
    store.handleMenuAction('tools-xml')
    expect(store.textTool).toBe('xml')
    store.handleMenuAction('tools-sql')
    expect(store.textTool).toBe('sql')
    store.handleMenuAction('tools-crypt')
    expect(store.showCryptDialog).toBe(true)
  })

  it('surfaces a format hint for JSON/XML-shaped content and none for plain text', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    store.right = { path: '/tmp/b.txt', name: 'b.txt', content: 'just some text' }
    expect(store.leftFormatHint).toEqual({ kind: 'json', valid: true })
    expect(store.rightFormatHint).toBeNull()
  })

  it('has no format hint for content that is already pretty-printed', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{\n  "a": 1\n}' }
    expect(store.leftFormatHint).toBeNull()
  })

  it('surfaces an invalid-format hint (no Format action) for malformed JSON', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a": 1,}' }
    expect(store.leftFormatHint.kind).toBe('json')
    expect(store.leftFormatHint.valid).toBe(false)
  })

  it('formatSide pretty-prints the content in place', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    store.formatSide('left')
    expect(store.left.content).toBe('{\n  "a": 1\n}')
    expect(store.leftFormatHint).toBeNull() // now pretty, hint clears itself
  })

  it('formatSide is a no-op when the hint is invalid or missing', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a": 1,}' }
    store.formatSide('left')
    expect(store.left.content).toBe('{"a": 1,}') // unchanged, still invalid
    store.formatSide('right') // no right file at all
    expect(store.right).toBeNull()
  })

  it('dismissFormatHint hides the hint until the content changes again', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    expect(store.leftFormatHint).not.toBeNull()
    store.dismissFormatHint('left')
    expect(store.leftFormatHint).toBeNull()
    store.left = { ...store.left, content: '{"b":2}' }
    expect(store.leftFormatHint).not.toBeNull() // new content, dismissal doesn't carry over
  })

  it('defaults to Light and toggleTheme flips the ground, persisting + stamping', () => {
    const store = useDiffStore()
    expect(store.theme).toBe('light') // Light is the default
    store.toggleTheme()
    expect(store.theme).toBe('dark')
    expect(localStorage.getItem('diffbro.theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    store.toggleTheme()
    expect(store.theme).toBe('light')
  })

  it('setTheme applies any named theme and normalizes an unknown one to Light', () => {
    const store = useDiffStore()
    store.setTheme('neon')
    expect(store.theme).toBe('neon')
    expect(document.documentElement.dataset.theme).toBe('neon')
    expect(localStorage.getItem('diffbro.theme')).toBe('neon')
    // Ctrl+D from a dark-ground theme flips to Light.
    store.toggleTheme()
    expect(store.theme).toBe('light')
    store.setTheme('bogus')
    expect(store.theme).toBe('light')
  })
  it('adds a trusted key before clearing the pending state, then opens the manager', async () => {
    const store = useDiffStore()
    const seen = []
    window.api = {
      addTrustedKeyNamed: async (key, label) => {
        // The naming dialog must still be up while the key is being stored —
        // TrustedKeysDialog re-reads its list the moment this clears.
        seen.push(store.pendingTrustedKey?.fingerprint ?? null)
        return { ok: true, label, fingerprint: 'AB:CD', key }
      }
    }
    store.pendingTrustedKey = { key: 'pub', fingerprint: 'AB:CD', label: 'Alice' }
    await store.confirmTrustedKey('Alice — laptop')
    expect(seen).toEqual(['AB:CD'])
    expect(store.pendingTrustedKey).toBeNull()
    expect(store.showTrustedKeysDialog).toBe(true)
    expect(store.notice).toContain('Alice — laptop')
  })

  it('leaves the manager closed when the key could not be added', async () => {
    const store = useDiffStore()
    window.api = { addTrustedKeyNamed: async () => ({ error: 'bad-key' }) }
    store.pendingTrustedKey = { key: 'pub', fingerprint: 'AB:CD', label: 'Alice' }
    await store.confirmTrustedKey('Alice')
    expect(store.pendingTrustedKey).toBeNull()
    expect(store.showTrustedKeysDialog).toBe(false)
  })
  it('every menu action in the table runs without touching an unmapped one', () => {
    const store = useDiffStore()
    // An unknown action must be a no-op, not a throw: menu strings come from
    // two places (main's menu and MenuBar.vue) and drift is survivable.
    expect(() => store.handleMenuAction('no-such-action')).not.toThrow()
    store.handleMenuAction('settings')
    expect(store.showSettingsDialog).toBe(true)
    store.handleMenuAction('manage-keys')
    expect(store.showTrustedKeysDialog).toBe(true)
    store.handleMenuAction('export-pubkey')
    expect(store.showShareKeyDialog).toBe(true)
    store.handleMenuAction('config-backup')
    expect(store.configMode).toBe('backup')
    store.handleMenuAction('config-restore')
    expect(store.configMode).toBe('restore')
    store.handleMenuAction('toggle-split')
    expect(store.renderSideBySide).toBe(false)
  })

  it('save from the menu only opens the dialog when there is something to save', () => {
    const store = useDiffStore()
    store.handleMenuAction('save')
    expect(store.showSaveDialog).toBe(false)
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.handleMenuAction('save')
    expect(store.showSaveDialog).toBe(true)
  })

  it('snapshot/restore round-trips a paste-mode session', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'left text'
    store.pasteRight = 'right text'
    store.ignoreTrimWhitespace = true
    const snap = store.snapshot()

    const fresh = useDiffStore()
    fresh.clear()
    fresh.restore(snap)
    expect(fresh.mode).toBe('paste')
    expect(fresh.pasteLeft).toBe('left text')
    expect(fresh.pasteRight).toBe('right text')
    expect(fresh.ignoreTrimWhitespace).toBe(true)
  })

  it('restore fills in defaults for fields an older saved diff lacks', () => {
    const store = useDiffStore()
    store.restore({ left: FILE('a.txt'), right: FILE('b.txt') })
    expect(store.mode).toBe('files')
    expect(store.pasteLeft).toBe('')
    expect(store.renderSideBySide).toBe(true)
    expect(store.ignoreTrimWhitespace).toBe(false)
  })

  it('formatSide pretty-prints in place, and only when the hint says it is valid', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    store.right = { path: '/tmp/b.json', name: 'b.json', content: '{"a":' } // invalid
    store.formatSide('left')
    store.formatSide('right')
    expect(store.left.content).toBe('{\n  "a": 1\n}')
    expect(store.right.content).toBe('{"a":') // untouched — never mangle bad input
  })

  it('refreshFromDisk reloads a side whose content changed and says so', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    window.api = {
      readFile: async (path) => ({ path, name: 'a.txt', content: 'edited elsewhere' })
    }
    await store.refreshFromDisk()
    expect(store.left.content).toBe('edited elsewhere')
    expect(store.notice).toContain('changed on disk')
  })

  it('refreshFromDisk leaves the last good state when the file is gone', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    window.api = {
      readFile: async () => {
        throw new Error('ENOENT')
      }
    }
    await store.refreshFromDisk()
    expect(store.left.content).toBe('content of a.txt')
  })

  it('swap exchanges the two sides', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.swap()
    expect(store.left.name).toBe('b.txt')
    expect(store.right.name).toBe('a.txt')
  })

  it('clear wipes both sides, the stats and any pasted text', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.stats = { additions: 1, deletions: 2 }
    store.pasteLeft = 'x'
    store.pasteRight = 'y'
    store.clear()
    expect(store.left).toBeNull()
    expect(store.right).toBeNull()
    expect(store.stats).toBeNull()
    expect(store.pasteLeft).toBe('')
    expect(store.pasteRight).toBe('')
  })

  it('a dropped public key opens the naming dialog instead of loading a diff', async () => {
    const store = useDiffStore()
    window.api = {
      readKeyFile: async () => ({
        ok: true,
        key: { format: 'k', sign: 's', box: 'b' },
        fingerprint: 'AB:CD',
        defaultLabel: 'Alice'
      })
    }
    await store.receiveDroppedKey('/tmp/alice.diffbrokey')
    expect(store.pendingTrustedKey).toMatchObject({ fingerprint: 'AB:CD', label: 'Alice' })
    expect(store.left).toBeNull()
  })

  it('refuses your own key with an explanation rather than adding it', async () => {
    const store = useDiffStore()
    window.api = { readKeyFile: async () => ({ error: 'own-key' }) }
    await store.receiveDroppedKey('/tmp/mine.diffbrokey')
    expect(store.pendingTrustedKey).toBeNull()
    expect(store.notice).toContain('your own public key')
  })

  it('dropping two files fills both sides in drop order', async () => {
    const store = useDiffStore()
    window.api = {
      readFile: async (path) => ({ path, name: path.split('/').pop(), content: path })
    }
    await store.dropFiles(['/tmp/one.txt', '/tmp/two.txt'])
    expect(store.left.name).toBe('one.txt')
    expect(store.right.name).toBe('two.txt')
  })

  it('dropping onto a complete comparison asks before discarding it', async () => {
    const store = useDiffStore()
    window.api = {
      readFile: async (path) => ({ path, name: path.split('/').pop(), content: path })
    }
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    await store.dropFiles(['/tmp/new.txt'])
    expect(store.pendingReplace).toEqual(['/tmp/new.txt'])
    expect(store.left.name).toBe('a.txt') // nothing replaced yet

    await store.confirmReplace()
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('new.txt')
    expect(store.right).toBeNull() // waiting for the second file
  })

  it('a single dropped file targets the slot it was dropped on', async () => {
    const store = useDiffStore()
    window.api = {
      readFile: async (path) => ({ path, name: path.split('/').pop(), content: path })
    }
    await store.dropFiles(['/tmp/right.txt'], 'right')
    expect(store.right.name).toBe('right.txt')
    expect(store.left).toBeNull()
  })

  it('showNotice replaces the previous message', () => {
    const store = useDiffStore()
    store.showNotice('first')
    store.showNotice('second')
    expect(store.notice).toBe('second')
  })
  it('key export/copy close the dialog and explain the next step', async () => {
    const store = useDiffStore()
    store.showShareKeyDialog = true
    window.api = { exportPublicKey: async () => ({ ok: true }) }
    await store.runExportKey('Alice — laptop')
    expect(store.showShareKeyDialog).toBe(false)
    expect(store.notice).toContain('Add Trusted Key')

    store.showShareKeyDialog = true
    window.api = { copyPublicKey: async () => ({ ok: true }) }
    await store.runCopyKey('Alice — laptop')
    expect(store.showShareKeyDialog).toBe(false)
    expect(store.notice).toContain('copied')
  })

  it('a cancelled key export leaves the dialog open', async () => {
    const store = useDiffStore()
    store.showShareKeyDialog = true
    window.api = { exportPublicKey: async () => ({ canceled: true }) }
    await store.runExportKey('x')
    expect(store.showShareKeyDialog).toBe(true)
  })

  it('addTrustedKey turns each failure into its own message', async () => {
    const store = useDiffStore()
    window.api = { addTrustedKey: async () => ({ error: 'own-key' }) }
    await store.addTrustedKey()
    expect(store.notice).toContain('your own public key')
    expect(store.pendingTrustedKey).toBeNull()

    window.api = { addTrustedKey: async () => ({ error: 'not-a-key' }) }
    await store.addTrustedKey()
    expect(store.notice).toContain('not a valid public key')

    window.api = { addTrustedKey: async () => ({ canceled: true }) }
    store.notice = null
    await store.addTrustedKey()
    expect(store.notice).toBeNull() // cancelling says nothing
  })

  it('cancelTrustedKey drops the pending key without adding it', () => {
    const store = useDiffStore()
    store.pendingTrustedKey = { key: 'k', fingerprint: 'AB', label: 'Alice' }
    store.cancelTrustedKey()
    expect(store.pendingTrustedKey).toBeNull()
  })

  it('config backup reports where the file went, and names the failure otherwise', async () => {
    const store = useDiffStore()
    window.api = { backupConfig: async () => ({ ok: true, path: '/tmp/cfg.diffbroconf' }) }
    await store.runConfigBackup('passphrase')
    expect(store.notice).toContain('/tmp/cfg.diffbroconf')

    window.api = { backupConfig: async () => ({ error: 'nope' }) }
    await store.runConfigBackup('passphrase')
    expect(store.notice).toBe('Backup failed.')

    window.api = { backupConfig: async () => ({ canceled: true }) }
    store.notice = null
    await store.runConfigBackup('passphrase')
    expect(store.notice).toBeNull()
  })

  it('config restore applies the backed-up theme and distinguishes a wrong passphrase', async () => {
    const store = useDiffStore()
    expect(store.theme).toBe('light')
    window.api = {
      restoreConfig: async () => ({ ok: true, snippets: null, settings: { theme: 'neon' } })
    }
    await store.runConfigRestore('passphrase')
    expect(store.theme).toBe('neon')
    expect(store.notice).toContain('Configuration restored')

    window.api = { restoreConfig: async () => ({ error: 'wrong-passphrase' }) }
    await store.runConfigRestore('nope')
    expect(store.notice).toContain('Wrong passphrase')

    window.api = { restoreConfig: async () => ({ error: 'not-a-config-file' }) }
    await store.runConfigRestore('nope')
    expect(store.notice).toContain('not a Diff Bro configuration backup')
  })

  it('shareCurrent refuses when there is nothing loaded', () => {
    const store = useDiffStore()
    store.shareCurrent()
    expect(store.showSaveDialog).toBe(false)
    expect(store.notice).toContain('Nothing to share yet')
  })
})
