import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'

let dir
const state = { canceled: false, trusted: [] }
const saveDialogs = []

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: (opts) => {
      saveDialogs.push(opts)
      return Promise.resolve(
        state.canceled ? { canceled: true } : { canceled: false, filePath: join(dir, 'picked.diffbro') }
      )
    }
  }
}))
vi.mock('../../src/main/trustedKeys', () => ({ readTrusted: () => Promise.resolve(state.trusted) }))

const { createIdentityKeys, shareFilename } = await import('../../src/main/sealing')
const { sealAndWrite } = await import('../../src/main/shareExport')

const HOUR = 3600_000
let identity
let ana

const entry = (over = {}) => ({
  name: 'a ↔ b',
  createdAt: Date.now(),
  expiresAt: Date.now() + HOUR,
  snapshot: { left: { name: 'a' }, right: { name: 'b' } },
  tags: [],
  ...over
})
const run = (over = {}, fps = ['fp-ana']) =>
  sealAndWrite({ entry: entry(over), recipientFps: fps, identity })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'diffbro-export-test-'))
  saveDialogs.length = 0
  state.canceled = false
  identity = createIdentityKeys()
  const peer = createIdentityKeys()
  ana = { fingerprint: peer.pub.fingerprint, label: 'Ana', sign: peer.pub.sign, box: peer.pub.box }
  state.trusted = [{ ...ana, fingerprint: 'fp-ana' }]
})
afterEach(() => rmSync(dir, { force: true, recursive: true }))

describe('sealAndWrite', () => {
  it('writes a sealed file whose name is forced to its ciphertext hash', async () => {
    const res = await run()
    expect(res.ok).toBe(true)
    const file = JSON.parse(await readFile(res.path, 'utf-8'))
    expect(basename(res.path)).toBe(shareFilename(file))
    expect(file.ciphertext).toBeTruthy()
  })

  it('ignores the directory the user picked but keeps the folder', async () => {
    const res = await run()
    expect(res.path.startsWith(dir)).toBe(true)
    expect(basename(res.path)).not.toBe('picked.diffbro')
  })

  it('never writes the plaintext into the sealed file', async () => {
    const res = await run({ snapshot: { left: { content: 'TOPSECRET' } } })
    expect(await readFile(res.path, 'utf-8')).not.toContain('TOPSECRET')
  })

  it('returns the resolved recipients so the caller can name them', async () => {
    const res = await run()
    expect(res.recipients.map((r) => r.label)).toEqual(['Ana'])
  })

  it('refuses an unknown fingerprint, and writes nothing', async () => {
    expect(await run({}, ['fp-nope'])).toEqual({ error: 'unknown-recipient' })
    expect(saveDialogs).toHaveLength(0)
  })

  it('refuses an empty recipient list', async () => {
    expect(await run({}, [])).toEqual({ error: 'unknown-recipient' })
  })

  it('de-duplicates repeated fingerprints', async () => {
    const res = await run({}, ['fp-ana', 'fp-ana'])
    expect(res.recipients).toHaveLength(1)
  })

  // Never sign timestamps a receiver will reject.
  it('enforces the TTL ceiling at signing time', async () => {
    const res = await run({ expiresAt: Date.now() + 40 * 24 * HOUR })
    expect(res.error).toBeTruthy()
    expect(saveDialogs).toHaveLength(0)
  })

  it('writes nothing when the save dialog is cancelled', async () => {
    state.canceled = true
    expect(await run()).toEqual({ canceled: true })
  })

  it('names the recipient count in the dialog title', async () => {
    await run()
    expect(saveDialogs[0].title).toContain('one recipient')
  })
})
