import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map()
const state = {
  addresses: { ok: true, to: [{ label: 'Ana', email: 'ana@example.com' }] },
  sealed: { ok: true, path: '/tmp/diffbro/3f9c1ab27de40852.diffbro' },
  confirmResponse: 0,
  copied: { ok: true },
  staged: '/tmp/diffbro-clipboard/Ana-laptop.diffbrokey',
  stagedNames: []
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
  getIdentity: () => Promise.resolve({ priv: {}, pub: { fingerprint: 'me' } }),
  pubWithLabel: (label) =>
    Promise.resolve({
      sign: 'SIGN',
      box: 'BOX',
      label: label ?? 'Ana laptop',
      fingerprint: 'fp1234abcd'
    }),
  keyFileBasename: (label) => `${label || 'diffbro-public-key'}.diffbrokey`
}))
vi.mock('../../src/main/clipboardStage', () => ({
  stageFile: ({ name }) => {
    state.stagedNames.push(name)
    return Promise.resolve({ ok: true, path: state.staged })
  }
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
  state.stagedNames = []
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

  // The file is written before the URL is built, so every failure past that
  // point must hand the path back or the user has an orphan they never hear of.
  it('reports a too-long note as its own error, and names the written file', async () => {
    // Multibyte: bodyText caps at 2000 CHARACTERS, and each of these becomes six
    // in the percent-encoded query, so the cap is reached well inside that.
    const res = await handoff({ note: 'ą'.repeat(1500) })
    expect(res.error).toBe('note-too-long')
    expect(res.path).toBe(state.sealed.path)
    expect(opened).toEqual([])
  })

  it('reports a machine with no mail app, reveals the file, and keeps the path', async () => {
    setOsHooksForTests({
      openExternal: () => Promise.reject(new Error('no handler')),
      showItemInFolder: (path) => revealed.push(path)
    })
    const res = await handoff()
    expect(res.error).toBe('no-mail-app')
    expect(res.path).toBe(state.sealed.path)
    expect(revealed).toEqual([state.sealed.path])
  })

  it('honours the reveal preference', async () => {
    await handoff({ reveal: false })
    expect(opened).toHaveLength(1)
    expect(revealed).toEqual([])
  })

  // Rule 1. A grep over mail.js alone would miss a socket in anything it
  // imports, so this walks the whole local import graph.
  it('opens no socket anywhere in its import graph', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const NETWORK =
      /from\s+['"](node:)?(net|tls|https?|dgram|dns|http2)['"]|require\(['"](node:)?(net|tls|https?|dgram|dns|http2)['"]\)|\bfetch\(|XMLHttpRequest|WebSocket/
    const seen = new Set()
    const walk = (file) => {
      if (seen.has(file)) return
      seen.add(file)
      const src = readFileSync(file, 'utf-8')
      expect(src, file).not.toMatch(NETWORK)
      for (const [, spec] of src.matchAll(/from\s+'(\.[^']+)'/g)) {
        // .json is data, not code — it cannot open a socket, and appending .js
        // to it would send the walk at a file that does not exist.
        if (spec.endsWith('.json')) continue
        walk(join(dirname(file), spec.endsWith('.js') ? spec : `${spec}.js`))
      }
    }
    walk('src/main/mail.js')
    // Proof the walk actually reached past the entry file.
    expect(seen.size).toBeGreaterThan(5)
  })
})

// The key hand-off: same walk as the diff's, but the draft is UNADDRESSED (the
// key goes to someone not yet in the trust store) and the file is the staged
// public key, never a renderer-named path.
describe('mail:keyHandoff', () => {
  const keyHandoff = (args = {}) => handlers.get('mail:keyHandoff')({ sender: {} }, args)

  it('stages the key, copies it, and opens a recipient-less draft carrying the fingerprint', async () => {
    const res = await keyHandoff({ label: 'Ana laptop' })

    expect(res.ok).toBe(true)
    expect(state.stagedNames).toEqual(['Ana laptop.diffbrokey'])
    expect(copies).toEqual([state.staged])
    expect(opened).toHaveLength(1)
    const url = new URL(opened[0])
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('')
    expect(url.searchParams.get('body')).toContain('fp1234abcd')
    expect([...url.searchParams.keys()].sort()).toEqual(['body', 'subject'])
  })

  it('cancelling keeps the staged file and says where it is', async () => {
    state.confirmResponse = 1
    const res = await keyHandoff({ label: 'x' })
    expect(res.canceled).toBe(true)
    expect(res.path).toBe(state.staged)
    expect(opened).toHaveLength(0)
  })

  it('degrades to clipboard + reveal when no mail app answers', async () => {
    setOsHooksForTests({
      openExternal: () => Promise.reject(new Error('no handler')),
      showItemInFolder: (path) => revealed.push(path)
    })
    const res = await keyHandoff({ label: 'x' })
    expect(res.error).toBe('no-mail-app')
    expect(res.copied).toBe(true)
    expect(revealed).toEqual([state.staged])
  })

  it('honours reveal: false the way the diff flow does', async () => {
    await keyHandoff({ label: 'x', reveal: false })
    expect(revealed).toHaveLength(0)
  })
})
