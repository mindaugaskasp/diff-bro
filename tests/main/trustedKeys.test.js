import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

let dataDir
const handlers = new Map()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }
}))
vi.mock('../../src/main/appData', () => ({
  dataFile: (name) => join(dataDir, name)
}))

const { addressesFor, readTrusted, registerTrustedKeyIpc, replaceTrusted, storeTrusted } =
  await import('../../src/main/trustedKeys')

const call = (channel, ...args) => handlers.get(channel)({}, ...args)
const trustFile = () => join(dataDir, 'trusted-keys.json')
const key = (n) => ({ sign: `sign-${n}`, box: `box-${n}` })

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'diffbro-trust-test-'))
  handlers.clear()
  registerTrustedKeyIpc()
})
afterEach(() => rmSync(dataDir, { force: true, recursive: true }))

describe('readTrusted', () => {
  it('is empty when there is no file', async () => {
    expect(await readTrusted()).toEqual([])
  })

  it('is empty rather than throwing on junk', async () => {
    await replaceTrusted([])
    const { writeFile } = await import('fs/promises')
    await writeFile(trustFile(), 'not json')
    expect(await readTrusted()).toEqual([])
  })
})

describe('storeTrusted', () => {
  it('adds a key with its label', async () => {
    await storeTrusted(key('a'), 'fp-a', 'Ana')
    expect(await readTrusted()).toEqual([
      { fingerprint: 'fp-a', label: 'Ana', sign: 'sign-a', box: 'box-a' }
    ])
  })

  it('falls back to the fingerprint when the label is blank', async () => {
    await storeTrusted(key('a'), 'fp-a', '   ')
    expect((await readTrusted())[0].label).toBe('fp-a')
  })

  it('replaces an existing entry rather than duplicating it', async () => {
    await storeTrusted(key('a'), 'fp-a', 'Ana')
    await storeTrusted(key('b'), 'fp-a', 'Ana renamed')
    const list = await readTrusted()
    expect(list).toHaveLength(1)
    expect(list[0].sign).toBe('sign-b')
  })

  // Re-importing a peer's key after they rotate must not silently lose the
  // address you typed for them.
  it('keeps an address already stored for that fingerprint', async () => {
    await storeTrusted(key('a'), 'fp-a', 'Ana')
    await call('share:setTrustedEmail', 'fp-a', 'ana@example.com')
    await storeTrusted(key('b'), 'fp-a', 'Ana')
    expect((await readTrusted())[0].email).toBe('ana@example.com')
  })
})

describe('share:listTrusted', () => {
  it('projects to fingerprint, label and email — never key material', async () => {
    await storeTrusted(key('a'), 'fp-a', 'Ana')
    expect(await call('share:listTrusted')).toEqual([
      { fingerprint: 'fp-a', label: 'Ana', email: null }
    ])
  })
})

describe('share:setTrustedEmail', () => {
  beforeEach(async () => {
    await storeTrusted(key('a'), 'fp-a', 'Ana')
  })

  it('stores a valid address', async () => {
    expect(await call('share:setTrustedEmail', 'fp-a', 'ana@example.com')).toEqual({
      ok: true,
      fingerprint: 'fp-a',
      email: 'ana@example.com'
    })
    expect((await readTrusted())[0].email).toBe('ana@example.com')
  })

  it('trims before storing', async () => {
    await call('share:setTrustedEmail', 'fp-a', '  ana@example.com  ')
    expect((await readTrusted())[0].email).toBe('ana@example.com')
  })

  // Rule 6: a stored address reaches a mailto: header, so it is refused at the
  // boundary rather than sanitised on the way out.
  it('refuses an address that could inject a header, and writes nothing', async () => {
    expect(await call('share:setTrustedEmail', 'fp-a', 'a@b.co\r\nBcc: evil@x.com')).toEqual({
      error: 'bad-email'
    })
    expect((await readTrusted())[0].email).toBeUndefined()
    expect(JSON.parse(await readFile(trustFile(), 'utf-8'))[0].email).toBeUndefined()
  })

  it('refuses other malformed addresses', async () => {
    for (const bad of ['nope', 'a@b', 'a@b.co,c@d.co', '<a@b.co>']) {
      expect(await call('share:setTrustedEmail', 'fp-a', bad), bad).toEqual({ error: 'bad-email' })
    }
  })

  it('clears the address on an empty string', async () => {
    await call('share:setTrustedEmail', 'fp-a', 'ana@example.com')
    expect(await call('share:setTrustedEmail', 'fp-a', '')).toEqual({
      ok: true,
      fingerprint: 'fp-a',
      email: null
    })
    expect((await readTrusted())[0]).not.toHaveProperty('email')
  })

  it('refuses an unknown fingerprint', async () => {
    expect(await call('share:setTrustedEmail', 'fp-nope', 'a@b.co')).toEqual({ error: 'unknown' })
  })
})

describe('share:renameTrusted and share:removeTrusted still behave', () => {
  it('renames, keeping the address', async () => {
    await storeTrusted(key('a'), 'fp-a', 'Ana')
    await call('share:setTrustedEmail', 'fp-a', 'ana@example.com')
    expect(await call('share:renameTrusted', 'fp-a', 'Ana P')).toEqual({
      ok: true,
      label: 'Ana P',
      fingerprint: 'fp-a'
    })
    expect((await readTrusted())[0].email).toBe('ana@example.com')
  })

  it('refuses to rename an unknown fingerprint', async () => {
    expect(await call('share:renameTrusted', 'nope', 'x')).toEqual({ error: 'unknown' })
  })

  it('removes, and reports an unknown fingerprint', async () => {
    await storeTrusted(key('a'), 'fp-a', 'Ana')
    expect(await call('share:removeTrusted', 'fp-a')).toEqual({ ok: true })
    expect(await readTrusted()).toEqual([])
    expect(await call('share:removeTrusted', 'fp-a')).toEqual({
      ok: false,
      error: 'unknown-recipient'
    })
  })
})

describe('addressesFor', () => {
  beforeEach(async () => {
    await storeTrusted(key('a'), 'fp-a', 'Ana')
    await storeTrusted(key('b'), 'fp-b', 'Tomas')
    await call('share:setTrustedEmail', 'fp-a', 'ana@example.com')
  })

  it('resolves in the order asked', async () => {
    await call('share:setTrustedEmail', 'fp-b', 'tomas@example.com')
    expect(await addressesFor(['fp-b', 'fp-a'])).toEqual({
      ok: true,
      to: [
        { label: 'Tomas', email: 'tomas@example.com' },
        { label: 'Ana', email: 'ana@example.com' }
      ]
    })
  })

  it('de-duplicates', async () => {
    expect((await addressesFor(['fp-a', 'fp-a'])).to).toHaveLength(1)
  })

  // The renderer supplies fingerprints, so an unknown one is the shape a bug or
  // a crafted call takes — it must not resolve to nothing and proceed.
  it('refuses an unknown fingerprint', async () => {
    expect(await addressesFor(['fp-a', 'fp-nope'])).toEqual({ error: 'unknown-recipient' })
    expect(await addressesFor([])).toEqual({ error: 'unknown-recipient' })
  })

  it('names who is missing an address rather than failing blankly', async () => {
    expect(await addressesFor(['fp-a', 'fp-b'])).toEqual({
      error: 'no-address',
      who: ['Tomas']
    })
  })
})
