import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map()
const state = {
  addresses: { ok: true, to: [{ label: 'Ana', email: 'ana@example.com' }] },
  sealed: { ok: true, path: '/tmp/diffbro/3f9c1ab27de40852.diffbro' },
  confirmResponse: 0,
  copied: { ok: true }
}
const opened = []
const revealed = []
const copies = []
const messageBoxes = []

vi.mock('electron', () => ({
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: {
    showMessageBox: (_parent, opts) => {
      messageBoxes.push(opts)
      return Promise.resolve({ response: state.confirmResponse })
    }
  },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() }
}))
vi.mock('../../src/main/trustedKeys', () => ({
  addressesFor: () => Promise.resolve(state.addresses)
}))
vi.mock('../../src/main/shareExport', () => ({
  sealAndWrite: () => Promise.resolve(state.sealed)
}))
vi.mock('../../src/main/clipboardCopy', () => ({
  copyPathToClipboard: (path) => {
    copies.push(path)
    return state.copied
  }
}))
vi.mock('../../src/main/share', () => ({
  getIdentity: () => Promise.resolve({ priv: {}, pub: { fingerprint: 'me' } })
}))

const { registerMailIpc, setOsHooksForTests } = await import('../../src/main/mail')

const entry = { name: 'config-v1 ↔ config-v2', expiresAt: Date.UTC(2026, 7, 5) }
const handoff = (args = {}) =>
  handlers.get('mail:handoff')({ sender: {} }, { entry, recipientFps: ['fp-ana'], ...args })

beforeEach(() => {
  handlers.clear()
  opened.length = 0
  revealed.length = 0
  copies.length = 0
  messageBoxes.length = 0
  state.addresses = { ok: true, to: [{ label: 'Ana', email: 'ana@example.com' }] }
  state.sealed = { ok: true, path: '/tmp/diffbro/3f9c1ab27de40852.diffbro' }
  state.confirmResponse = 0
  state.copied = { ok: true }
  setOsHooksForTests({
    openExternal: (url) => opened.push(url),
    showItemInFolder: (path) => revealed.push(path)
  })
  registerMailIpc()
})
afterEach(() => vi.clearAllMocks())

describe('mail:handoff', () => {
  it('opens a mailto:, copies the sealed file, and reveals it', async () => {
    const res = await handoff({ note: 'Have a look' })

    expect(res.ok).toBe(true)
    expect(res.name).toBe('3f9c1ab27de40852.diffbro')
    expect(res.copied).toBe(true)
    expect(opened).toHaveLength(1)
    const url = new URL(opened[0])
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('ana@example.com')
    expect(url.searchParams.get('body')).toBe('Have a look')
  })

  // The reveal and the copy must use the path MAIN computed — the renderer never
  // supplies one, so they cannot disagree.
  it('copies and reveals exactly the path it sealed', async () => {
    await handoff()
    expect(copies).toEqual([state.sealed.path])
    expect(revealed).toEqual([state.sealed.path])
  })

  it('fills the subject template from the entry', async () => {
    await handoff({ subjectTemplate: 'Sealed diff: {name}' })
    expect(new URL(opened[0]).searchParams.get('subject')).toBe(
      'Sealed diff: config-v1 ↔ config-v2'
    )
  })

  it('never builds a mailto: carrying an attachment parameter', async () => {
    await handoff({ note: 'x&attach=/etc/passwd' })
    expect([...new URL(opened[0]).searchParams.keys()]).toEqual(['subject', 'body'])
  })

  // A diff name is user text and reaches a header through the template.
  it('strips control characters a diff name could carry', async () => {
    await handoff({
      entry: { name: 'evil\r\nBcc: attacker@x.com' },
      subjectTemplate: '{name}'
    })
    expect(opened[0]).not.toContain('%0D')
    expect(opened[0]).not.toContain('%0A')
  })

  it('confirms before the OS is handed anything', async () => {
    await handoff()
    expect(messageBoxes).toHaveLength(1)
    expect(messageBoxes[0].detail).toContain('ana@example.com')
  })

  it('opens nothing when the user cancels, but keeps the written file', async () => {
    state.confirmResponse = 1
    const res = await handoff()
    expect(res).toEqual({ canceled: true, path: state.sealed.path })
    expect(opened).toEqual([])
    expect(revealed).toEqual([])
    expect(copies).toEqual([])
  })

  it('reports a recipient with no address, and seals nothing', async () => {
    state.addresses = { error: 'no-address', who: ['Tomas'] }
    expect(await handoff()).toEqual({ error: 'no-address', who: ['Tomas'] })
    expect(opened).toEqual([])
  })

  it('passes a sealing failure straight back', async () => {
    state.sealed = { error: 'invalid-ttl' }
    expect(await handoff()).toEqual({ error: 'invalid-ttl' })
    expect(opened).toEqual([])
  })

  it('reports a cancelled save dialog without opening anything', async () => {
    state.sealed = { canceled: true }
    expect(await handoff()).toEqual({ canceled: true })
    expect(opened).toEqual([])
  })

  // A clipboard that would not take the file is not a failed hand-off: the mail
  // draft still opens and the reveal is the fallback.
  it('still opens the draft when the copy did not land', async () => {
    state.copied = { error: 'unsupported' }
    const res = await handoff()
    expect(res.ok).toBe(true)
    expect(res.copied).toBe(false)
    expect(opened).toHaveLength(1)
    expect(revealed).toHaveLength(1)
  })

  it('addresses several recipients', async () => {
    state.addresses = {
      ok: true,
      to: [
        { label: 'Ana', email: 'ana@example.com' },
        { label: 'Rūta', email: 'ruta@example.com' }
      ]
    }
    const res = await handoff()
    expect(new URL(opened[0]).pathname).toBe('ana@example.com,ruta@example.com')
    expect(res.to).toBe('Ana, Rūta')
  })

  it('opens no socket — there is no network module in reach', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/main/mail.js', 'utf-8')
    )
    expect(source).not.toMatch(/require\(['"]?(net|tls|https?)|from '(node:)?(net|tls|https?)'/)
  })
})
