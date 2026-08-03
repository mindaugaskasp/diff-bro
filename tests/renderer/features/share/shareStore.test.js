// Sharing a diff and trusting the keys that make it possible. The notices land
// on the core store; nothing here touches key material, which lives in main.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useShareStore } from '../../../../src/renderer/src/features/share'
import { useDiffStore } from '../../../../src/renderer/src/stores/diffStore'

const share = () => useShareStore()
const FILE = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

describe('shareStore', () => {
  it('shareCurrent explains itself instead of opening dialogs on an empty app', () => {
    const store = useDiffStore()
    share().shareCurrent()
    expect(store.showSaveDialog).toBe(false)
    expect(share().saveThenShare).toBe(false)
    expect(store.notice).toContain('Nothing to share')
  })
  it('shareCurrent chains save → share when a diff is present', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'x'
    share().shareCurrent()
    expect(store.showSaveDialog).toBe(true)
    expect(share().saveThenShare).toBe(true)
  })
  it('adds a trusted key before clearing the pending state, then opens the manager', async () => {
    const store = useDiffStore()
    const seen = []
    window.api = {
      addTrustedKeyNamed: async (key, label) => {
        // The naming dialog must still be up while the key is being stored —
        // TrustedKeysDialog re-reads its list the moment this clears.
        seen.push(share().pendingTrustedKey?.fingerprint ?? null)
        return { ok: true, label, fingerprint: 'AB:CD', key }
      }
    }
    share().pendingTrustedKey = { key: 'pub', fingerprint: 'AB:CD', label: 'Alice' }
    await share().confirmTrustedKey('Alice — laptop')
    expect(seen).toEqual(['AB:CD'])
    expect(share().pendingTrustedKey).toBeNull()
    expect(share().showTrustedKeysDialog).toBe(true)
    expect(store.notice).toContain('Alice — laptop')
  })
  it('leaves the manager closed when the key could not be added', async () => {
    window.api = { addTrustedKeyNamed: async () => ({ error: 'bad-key' }) }
    share().pendingTrustedKey = { key: 'pub', fingerprint: 'AB:CD', label: 'Alice' }
    await share().confirmTrustedKey('Alice')
    expect(share().pendingTrustedKey).toBeNull()
    expect(share().showTrustedKeysDialog).toBe(false)
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
    await share().receiveDroppedKey('/tmp/alice.diffbrokey')
    expect(share().pendingTrustedKey).toMatchObject({ fingerprint: 'AB:CD', label: 'Alice' })
    expect(store.left).toBeNull()
  })
  it('refuses your own key with an explanation rather than adding it', async () => {
    const store = useDiffStore()
    window.api = { readKeyFile: async () => ({ error: 'own-key' }) }
    await share().receiveDroppedKey('/tmp/mine.diffbrokey')
    expect(share().pendingTrustedKey).toBeNull()
    expect(store.notice).toContain('your own public key')
  })
  it('key export/copy close the dialog and explain the next step', async () => {
    const store = useDiffStore()
    share().showShareKeyDialog = true
    window.api = { exportPublicKey: async () => ({ ok: true }) }
    await share().runExportKey('Alice — laptop')
    expect(share().showShareKeyDialog).toBe(false)
    expect(store.notice).toContain('Add Trusted Key')

    share().showShareKeyDialog = true
    window.api = { copyPublicKey: async () => ({ ok: true }) }
    await share().runCopyKey('Alice — laptop')
    expect(share().showShareKeyDialog).toBe(false)
    expect(store.notice).toContain('copied')
  })
  it('a cancelled key export leaves the dialog open', async () => {
    share().showShareKeyDialog = true
    window.api = { exportPublicKey: async () => ({ canceled: true }) }
    await share().runExportKey('x')
    expect(share().showShareKeyDialog).toBe(true)
  })
  it('addTrustedKey turns each failure into its own message', async () => {
    const store = useDiffStore()
    window.api = { addTrustedKey: async () => ({ error: 'own-key' }) }
    await share().addTrustedKey()
    expect(store.notice).toContain('your own public key')
    expect(share().pendingTrustedKey).toBeNull()

    window.api = { addTrustedKey: async () => ({ error: 'not-a-key' }) }
    await share().addTrustedKey()
    expect(store.notice).toContain('not a valid public key')

    window.api = { addTrustedKey: async () => ({ canceled: true }) }
    store.notice = null
    await share().addTrustedKey()
    expect(store.notice).toBeNull() // cancelling says nothing
  })
  it('cancelTrustedKey drops the pending key without adding it', () => {
    share().pendingTrustedKey = { key: 'k', fingerprint: 'AB', label: 'Alice' }
    share().cancelTrustedKey()
    expect(share().pendingTrustedKey).toBeNull()
  })
  it('shareCurrent refuses when there is nothing loaded', () => {
    const store = useDiffStore()
    share().shareCurrent()
    expect(store.showSaveDialog).toBe(false)
    expect(store.notice).toContain('Nothing to share yet')
  })
  it('receiveDroppedSharedDiff imports a dropped .diffbro and opens it', async () => {
    const store = useDiffStore()
    const createdAt = Date.now() - 5000
    const expiresAt = Date.now() + 5000
    const snapshot = { mode: 'files', left: FILE('l.txt'), right: FILE('r.txt') }
    window.api.shareImportPath = async () => ({
      ok: true,
      from: 'alice',
      entry: { name: 'from-drop', snapshot, createdAt, expiresAt }
    })
    // Minimal vault crypto round-trip so the just-imported entry re-opens.
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    window.api.vaultDecrypt = async (box) => box.data
    await share().receiveDroppedSharedDiff('/tmp/x.diffbro')
    expect(store.left).toMatchObject({ name: 'l.txt' })
    expect(store.right).toMatchObject({ name: 'r.txt' })
    expect(store.diffSaved).toBe(true) // opened from the vault — no unsaved prompt
    expect(store.notice).toContain('from-drop')
  })
  it('receiveDroppedSharedDiff surfaces an import error and opens nothing', async () => {
    const store = useDiffStore()
    window.api.shareImportPath = async () => ({ error: 'not-for-you' })
    await share().receiveDroppedSharedDiff('/tmp/x.diffbro')
    expect(store.left).toBeNull()
    expect(store.notice).toContain('different machine')
  })
  it('importShared opens the imported diff when nothing is on screen', async () => {
    const store = useDiffStore()
    const snapshot = { mode: 'files', left: FILE('l.txt'), right: FILE('r.txt') }
    window.api.shareImport = async () => ({
      ok: true,
      from: 'alice',
      entry: { name: 'menu-import', snapshot, createdAt: Date.now(), expiresAt: Date.now() + 5000 }
    })
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    window.api.vaultDecrypt = async (box) => box.data
    await share().importShared()
    expect(store.left).toMatchObject({ name: 'l.txt' })
    expect(store.right).toMatchObject({ name: 'r.txt' })
    expect(store.diffSaved).toBe(true) // opened from the vault
    expect(store.notice).toContain('Opened')
  })
  it('importShared keeps the current diff and only files the import when one is active', async () => {
    const store = useDiffStore()
    store.left = FILE('mine-a.txt')
    store.right = FILE('mine-b.txt')
    const snapshot = { mode: 'files', left: FILE('l.txt'), right: FILE('r.txt') }
    window.api.shareImport = async () => ({
      ok: true,
      from: 'alice',
      entry: { name: 'menu-import', snapshot, createdAt: Date.now(), expiresAt: Date.now() + 5000 }
    })
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    let decrypted = false
    window.api.vaultDecrypt = async (box) => ((decrypted = true), box.data)
    await share().importShared()
    // The view is untouched and the imported diff was never decrypted/opened.
    expect(store.left).toMatchObject({ name: 'mine-a.txt' })
    expect(decrypted).toBe(false)
    expect(store.notice).toContain('External diffs')
  })
  it('confirmTrustedKey flags the freshly added key so the manager can highlight it', async () => {
    window.api.addTrustedKeyNamed = async (key, label) => ({
      ok: true,
      label,
      fingerprint: 'AB:CD',
      key
    })
    share().pendingTrustedKey = { key: 'pub', fingerprint: 'AB:CD', label: 'Alice' }
    await share().confirmTrustedKey('Alice')
    expect(share().lastAddedTrustedFp).toBe('AB:CD')
  })
})
