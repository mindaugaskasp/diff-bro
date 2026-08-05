// Integration-style store tests: the mocked window.api routes through the REAL
// main-process crypto (vaultCrypt + snippetSealing), so the whole
// save/load/export/import/tamper/migrate path is exercised — only Electron IPC
// (file dialogs) is skipped.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import { createIdentityKeys } from '../../../src/main/sealing'
import { openSnippets, sealSnippets } from '../../../src/main/snippetSealing'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'
import {
  EXAMPLE_SNIPPET,
  MAX_TAGS,
  TAG_PALETTE,
  languageOf,
  useSnippetStore
} from '../../../src/renderer/src/stores/snippetStore'
import { createTranslator } from '../../../src/shared/i18n'

const t = createTranslator('en')

const KEY = randomBytes(32)
const DIFF = {
  mode: 'files',
  left: { name: 'a', content: '1' },
  right: { name: 'b', content: '2' }
}
const IDENTITY = createIdentityKeys()
let lastExportedFile = null

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  lastExportedFile = null
  window.api = {
    vaultEncrypt: async (plaintext, aad) => vaultEncrypt(KEY, plaintext, aad),
    vaultDecrypt: async (box, aad) => vaultDecrypt(KEY, box, aad),
    exportSnippets: async (bundle, passphrase) => {
      lastExportedFile = await sealSnippets(bundle, passphrase, IDENTITY)
      return { ok: true, path: '/tmp/fake.diffbrosnip' }
    },
    importSnippets: async (passphrase) => {
      if (!lastExportedFile) return { error: 'not-a-snippet-file' }
      return openSnippets(lastExportedFile, passphrase)
    }
  }
})

describe('snippetStore — first-run example', () => {
  it('seeds the Mermaid example through the normal encrypted add path', async () => {
    const store = useSnippetStore()
    const id = await store.seedExample()
    expect(id).toBeTruthy()
    expect(store.entries).toHaveLength(1)
    const [entry] = store.entries
    expect(entry.name).toBe(t(EXAMPLE_SNIPPET.nameKey))
    expect(languageOf(entry)).toBe('mermaid')
    // stored encrypted, decrypts back to the example content
    const raw = localStorage.getItem('diffbro.snippets')
    expect(raw).not.toContain('flowchart')
    await expect(store.load(id)).resolves.toBe(EXAMPLE_SNIPPET.content)
  })

  it('reports null (and seeds nothing) when the vault key is unavailable', async () => {
    const store = useSnippetStore()
    window.api.vaultEncrypt = async () => ({ error: 'vault-key-unavailable' })
    const id = await store.seedExample()
    expect(id).toBeNull()
    expect(store.entries).toHaveLength(0)
  })
})

describe('snippetStore — effective language', () => {
  const DIAGRAM = 'flowchart TD\n  A --> B'

  it('records the detected language so an auto snippet still resolves', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'diagram', content: DIAGRAM, language: 'auto', tags: [] })
    expect(store.entries[0].language).toBe('auto')
    expect(languageOf(store.entries[0])).toBe('mermaid')
  })

  it('keeps an explicit choice over detection', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'as text', content: DIAGRAM, language: 'plaintext', tags: [] })
    expect(languageOf(store.entries[0])).toBe('plaintext')
  })

  it('re-detects when the content is edited', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'note', content: 'just a note', language: 'auto', tags: [] })
    expect(languageOf(store.entries[0])).toBe('plaintext')
    await store.update(id, { name: 'note', content: DIAGRAM, language: 'auto' })
    expect(languageOf(store.entries[0])).toBe('mermaid')
  })

  it('backfills detection for an older entry the first time it is decrypted', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'legacy', content: DIAGRAM, language: 'auto', tags: [] })
    delete store.entries[0].detected // as an entry saved by an older build reads
    expect(languageOf(store.entries[0])).toBe('plaintext')
    await store.load(id)
    expect(languageOf(store.entries[0])).toBe('mermaid')
  })

  it('falls back to plaintext for entries saved before detection was recorded', () => {
    expect(languageOf({ language: 'auto' })).toBe('plaintext')
    expect(languageOf({ language: 'json' })).toBe('json')
  })

  it('auto-tags a saved snippet with its detected format', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'cfg', content: '{"a": 1, "b": 2}', language: 'auto' })
    expect(store.entries.find((e) => e.id === id).tags).toContain('json')
  })

  it('auto-tags with the explicit language, alongside the user tags', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'q', content: 'SELECT 1', language: 'sql', tags: ['wip'] })
    expect(store.entries.find((e) => e.id === id).tags).toEqual(
      expect.arrayContaining(['sql', 'wip'])
    )
  })

  it('adds no format tag for a plaintext snippet', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'note', content: 'hello world', language: 'plaintext' })
    expect(store.entries.find((e) => e.id === id).tags).toHaveLength(0)
  })

  it('records distinct {{variables}} on a claude prompt for the fill-on-copy cue', async () => {
    const store = useSnippetStore()
    const id = await store.add({
      name: 'p',
      content: 'Fix {{file}} for {{issue}}, then re-check {{file}}',
      language: 'claude'
    })
    expect(store.entries.find((e) => e.id === id).vars).toEqual(['file', 'issue'])
  })

  it('leaves vars empty when {{ }} is template code, not a claude prompt', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 't', content: '<b>{{ user.name }}</b>', language: 'html' })
    expect(store.entries.find((e) => e.id === id).vars).toEqual([])
  })
})

describe('snippetStore — tags model', () => {
  it('starts empty (no categories; Default is the implicit catch-all)', () => {
    const store = useSnippetStore()
    expect(store.entries).toEqual([])
    expect(store.tags).toEqual({})
    expect(store.defaultCount).toBe(0)
  })

  it('adds a tagged snippet, encrypted at rest, and registers its tags', async () => {
    const store = useSnippetStore()
    const id = await store.add({
      name: 'find user',
      content: 'SELECT * FROM users',
      language: 'sql',
      tags: ['sql', 'postgres']
    })
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0].tags).toEqual(['sql', 'postgres'])
    expect(store.tags.sql).toBeTruthy()
    expect(store.tags.postgres).toBeTruthy()
    await expect(store.load(id)).resolves.toBe('SELECT * FROM users')

    const raw = localStorage.getItem('diffbro.snippets')
    expect(raw).toContain('sql') // tag names are plaintext by design
    expect(raw).not.toContain('SELECT * FROM users') // content is encrypted
  })

  it('a snippet with no tags is the Default catch-all', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'loose note', content: 'hello', language: 'auto', tags: [] })
    expect(store.entries[0].tags).toEqual([])
    expect(store.defaultCount).toBe(1)
  })

  it('caps a snippet at MAX_TAGS and de-duplicates', async () => {
    const store = useSnippetStore()
    const many = Array.from({ length: MAX_TAGS + 4 }, (_, i) => `t${i}`)
    await store.add({ name: 'x', content: 'y', language: 'auto', tags: ['dup', 'dup', ...many] })
    expect(store.entries[0].tags).toHaveLength(MAX_TAGS)
    expect(new Set(store.entries[0].tags).size).toBe(MAX_TAGS) // no duplicates kept
  })

  it('assigns distinct palette colors and honors caller-chosen colors', async () => {
    const store = useSnippetStore()
    await store.add({
      name: 'one',
      content: 'x',
      language: 'auto',
      tags: ['red-ish'],
      tagColors: { 'red-ish': TAG_PALETTE[6] }
    })
    expect(store.tags['red-ish'].color).toBe(TAG_PALETTE[6])
    await store.add({ name: 'two', content: 'x', language: 'auto', tags: ['auto-color'] })
    // Auto-assigned from the palette, and different from the taken one.
    expect(TAG_PALETTE).toContain(store.tags['auto-color'].color)
    expect(store.tags['auto-color'].color).not.toBe(TAG_PALETTE[6])
  })

  // The chip normalises a tag colour's LIGHTNESS to the theme's ground (ui.css),
  // so two palette entries that differ only in lightness render as one colour.
  // The previous palette had 20 entries but ~8 hues — three greens inside 3°.
  it('every palette colour is a distinct hue, not a lighter shade of another', () => {
    const hueOf = (hex) => {
      const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
      const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
      const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
      return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
    }
    const hues = TAG_PALETTE.map(hueOf).sort((a, b) => a - b)
    const gaps = hues.map((h, i) => (i ? h - hues[i - 1] : h + 360 - hues.at(-1)))
    expect(new Set(TAG_PALETTE).size).toBe(TAG_PALETTE.length)
    expect(Math.min(...gaps)).toBeGreaterThan(10)
  })

  it('update() re-encrypts content, renames, changes syntax, and retags', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'todo', content: 'old', language: 'auto', tags: ['a'] })
    await store.update(id, {
      name: 'Renamed',
      content: 'new content',
      language: 'python',
      tags: ['b', 'c']
    })
    const e = store.entries[0]
    expect(e.name).toBe('Renamed')
    expect(e.language).toBe('python')
    expect(e.tags).toEqual(['b', 'c'])
    await expect(store.load(id)).resolves.toBe('new content')
  })

  // Names are sentence-cased on the way in so the library reads uniformly no
  // matter how each one was typed — on create, on rename, and on restore.
  it('sentence-cases the name on add, update and restore', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'auth token', content: 'x', language: 'auto' })
    expect(store.entries[0].name).toBe('Auth token')

    await store.update(id, { name: 'refresh token', content: 'x', language: 'auto', tags: [] })
    expect(store.entries[0].name).toBe('Refresh token')

    await store.restoreBundle({ snippets: [{ name: 'from a bundle', content: 'y' }] })
    expect(store.entries.map((e) => e.name)).toContain('From a bundle')
  })

  // createdAt is inside the AAD (entryAad), so it can never move — updatedAt is
  // plain metadata beside it, the way tags are, and exists for the versioning /
  // history work to build on.
  describe('timestamps', () => {
    it('stamps createdAt and updatedAt together on add', async () => {
      const store = useSnippetStore()
      await store.add({ name: 'note', content: 'x', language: 'auto' })
      const e = store.entries[0]
      expect(e.createdAt).toBeGreaterThan(0)
      expect(e.updatedAt).toBe(e.createdAt)
    })

    it('bumps updatedAt on edit and leaves createdAt untouched', async () => {
      const store = useSnippetStore()
      const id = await store.add({ name: 'note', content: 'x', language: 'auto' })
      const { createdAt } = store.entries[0]
      store.entries[0].updatedAt = createdAt - 5000 // pretend the edit is later

      await store.update(id, { name: 'note', content: 'y', language: 'auto' })
      const e = store.entries[0]
      expect(e.createdAt).toBe(createdAt)
      expect(e.updatedAt).toBeGreaterThan(e.createdAt - 5000)
      // The AAD still matches, so the new ciphertext decrypts.
      await expect(store.load(id)).resolves.toBe('y')
    })

    it('does not touch updatedAt when a save is refused', async () => {
      const store = useSnippetStore()
      const id = await store.add({ name: 'note', content: 'x', language: 'auto' })
      const before = store.entries[0].updatedAt
      window.api.vaultEncrypt = async () => ({ error: 'vault-key-unavailable' })
      await store.update(id, { name: 'nope', content: 'z', language: 'auto' })
      expect(store.entries[0].updatedAt).toBe(before)
    })

    it('backfills updatedAt for entries written before the field existed', () => {
      localStorage.setItem(
        'diffbro.snippets',
        JSON.stringify({
          tags: {},
          entries: [{ id: 'a', aadSalt: 's', name: 'Old', createdAt: 1000, tags: [] }]
        })
      )
      const store = useSnippetStore()
      expect(store.entries[0].updatedAt).toBe(1000)
    })
  })

  // Timestamped, so a library of unnamed quick captures is still navigable.
  it('falls back to a timestamped placeholder when the name is blank', async () => {
    const store = useSnippetStore()
    await store.add({ name: '   ', content: 'x', language: 'auto' })
    expect(store.entries[0].name).toMatch(/^Untitled \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('retagging does NOT re-key (the AAD is fixed to id + salt + createdAt)', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 's', content: 'payload', language: 'auto', tags: ['x'] })
    const salt = store.entries[0].aadSalt
    await store.update(id, { name: 's', content: 'payload', language: 'auto', tags: ['y', 'z'] })
    expect(store.entries[0].aadSalt).toBe(salt) // unchanged
    await expect(store.load(id)).resolves.toBe('payload')
  })

  it('tagList is recency-ordered and counts usage; defaultCount tracks untagged', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['first'] })
    await store.add({ name: 'b', content: 'x', language: 'auto', tags: ['second'] })
    await store.add({ name: 'c', content: 'x', language: 'auto', tags: ['second'] }) // second is more used AND more recent
    await store.add({ name: 'd', content: 'x', language: 'auto', tags: [] }) // Default
    const names = store.tagList.map((t) => t.name)
    expect(names[0]).toBe('second') // most recently used first
    expect(store.tagList.find((t) => t.name === 'second').count).toBe(2)
    expect(store.defaultCount).toBe(1)
  })

  // --- tag management ---
  it('renameTag moves the tag on every snippet and in the registry', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['old'] })
    await store.add({ name: 'b', content: 'x', language: 'auto', tags: ['old', 'keep'] })
    store.renameTag('old', 'new')
    expect(store.tags.old).toBeUndefined()
    expect(store.tags.new).toBeTruthy()
    expect(store.entries.every((e) => !e.tags.includes('old'))).toBe(true)
    expect(store.entries[0].tags).toContain('new')
  })

  it('deleteTag removes it from every snippet (but deletes no snippets)', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['gone', 'stay'] })
    store.deleteTag('gone')
    expect(store.tags.gone).toBeUndefined()
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0].tags).toEqual(['stay'])
  })

  // Saved diffs draw from the SAME tag registry (vaultStore calls
  // snippetStore.registerTags), so a tag deleted here has to leave them too —
  // otherwise a saved diff keeps a tag the app no longer knows the colour of.
  it('deleteTag also strips the tag from saved diffs', async () => {
    const store = useSnippetStore()
    const vault = useVaultStore()
    await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['gone'] })
    await vault.save('a diff', null, DIFF, ['gone', 'stay'])

    store.deleteTag('gone')

    expect(vault.entries[0].tags).toEqual(['stay'])
  })

  it('deleteTag can take the snippets and saved diffs with it', async () => {
    const store = useSnippetStore()
    const vault = useVaultStore()
    await store.add({ name: 'doomed', content: 'x', language: 'auto', tags: ['gone'] })
    await store.add({ name: 'spared', content: 'x', language: 'auto', tags: ['stay'] })
    await vault.save('doomed diff', null, DIFF, ['gone'])
    await vault.save('spared diff', null, DIFF, ['stay'])

    store.deleteTag('gone', { withEntries: true })

    expect(store.entries.map((e) => e.name.toLowerCase())).toEqual(['spared'])
    expect(vault.entries.map((e) => e.name)).toEqual(['spared diff'])
    expect(store.tags.gone).toBeUndefined()
  })

  // Carrying the tag among others still means carrying it: the reader asked for
  // everything under that tag to go.
  it('deletes a record that carries the tag alongside others', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'multi', content: 'x', language: 'auto', tags: ['gone', 'stay'] })
    store.deleteTag('gone', { withEntries: true })
    expect(store.entries).toHaveLength(0)
    expect(store.tags.stay).toBeTruthy()
  })

  it('counts what a tag would take with it, before anything is deleted', async () => {
    const store = useSnippetStore()
    const vault = useVaultStore()
    await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['t'] })
    await store.add({ name: 'b', content: 'x', language: 'auto', tags: ['t'] })
    await vault.save('d', null, DIFF, ['t'])

    expect(store.taggedCount('t')).toEqual({ snippets: 2, diffs: 1 })
    expect(store.entries).toHaveLength(2)
    expect(vault.entries).toHaveLength(1)
  })

  it('recolorTag only accepts palette colors', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['t'] })
    store.recolorTag('t', TAG_PALETTE[3])
    expect(store.tags.t.color).toBe(TAG_PALETTE[3])
    store.recolorTag('t', '#123456') // not in palette — ignored
    expect(store.tags.t.color).toBe(TAG_PALETTE[3])
  })

  // --- delete flow ---
  it('requestDelete/confirmDelete removes a snippet; a tag delete removes the tag', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'doomed', content: 'x', language: 'auto', tags: ['t'] })
    store.requestDelete('snippet', id, 'doomed')
    store.cancelDelete()
    expect(store.entries).toHaveLength(1)
    store.requestDelete('snippet', id, 'doomed')
    store.confirmDelete()
    expect(store.entries).toHaveLength(0)

    const id2 = await store.add({
      name: 'has-tag',
      content: 'x',
      language: 'auto',
      tags: ['victim']
    })
    store.requestDelete('tag', 'victim', 'victim')
    store.confirmDelete()
    expect(store.tags.victim).toBeUndefined()
    expect(store.entries.find((e) => e.id === id2).tags).toEqual([])
  })

  // --- crypto safety ---
  it('drops a snippet whose salt was tampered with (AAD mismatch)', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'victim', content: 'secret', language: 'auto', tags: [] })
    store.entries[0].aadSalt = 'tampered'
    await expect(store.load(id)).resolves.toBeNull()
    expect(store.entries).toHaveLength(0)
  })

  it('never drops a snippet when the vault key is unavailable — it surfaces instead', async () => {
    const store = useSnippetStore()
    const id = await store.add({
      name: 'keep',
      content: 'never lose me',
      language: 'auto',
      tags: []
    })
    window.api.vaultDecrypt = async () => ({ error: 'vault-key-unavailable' })
    await expect(store.load(id)).resolves.toBeNull()
    expect(store.entries).toHaveLength(1)
    expect(store.keyError).toBe('vault-key-unavailable')
    window.api.vaultDecrypt = async (box, aad) => vaultDecrypt(KEY, box, aad)
    await expect(store.load(id)).resolves.toBe('never lose me')
    expect(store.keyError).toBeNull()
  })

  // --- favorites ---
  it('favorites collects favorited snippets and lifts them out of the main list', async () => {
    const store = useSnippetStore()
    const a = await store.add({ name: 'A', content: 'x', language: 'auto', tags: ['t'] })
    const b = await store.add({ name: 'B', content: 'x', language: 'auto', tags: ['t'] })
    // add() stamps createdAt from Date.now(), too fast apart to differ reliably;
    // pin explicit times so the newest-first order is deterministic.
    store.entries.find((e) => e.id === a).createdAt = 1000
    store.entries.find((e) => e.id === b).createdAt = 2000
    expect(store.favorites).toHaveLength(0)
    expect(store.listed.map((e) => e.name)).toEqual(['B', 'A']) // newest first
    store.toggleFavorite(a)
    expect(store.favorites.map((e) => e.name)).toEqual(['A'])
    expect(store.listed.map((e) => e.name)).toEqual(['B'])
    expect(localStorage.getItem('diffbro.snippets')).toContain('"favorite":true')
  })

  it('orders both the Favorites and All shelves newest-created first', async () => {
    const store = useSnippetStore()
    const ids = {}
    for (const n of ['Old', 'Mid', 'New'])
      ids[n] = await store.add({ name: n, content: 'x', language: 'auto', tags: [] })
    const at = { Old: 1000, Mid: 2000, New: 3000 }
    for (const e of store.entries) e.createdAt = at[e.name]
    expect(store.listed.map((e) => e.name)).toEqual(['New', 'Mid', 'Old'])
    store.toggleFavorite(ids.Old)
    store.toggleFavorite(ids.New)
    expect(store.favorites.map((e) => e.name)).toEqual(['New', 'Old'])
    expect(store.listed.map((e) => e.name)).toEqual(['Mid'])
  })

  // --- secret snippets ---
  describe('secret snippets', () => {
    it('records the flag, and stores the contents exactly as given', async () => {
      const store = useSnippetStore()
      const id = await store.add({
        name: 'Prod API key',
        content: 'sk-live-DEADBEEF',
        language: 'auto',
        secret: true
      })
      const entry = store.entries.find((e) => e.id === id)
      expect(entry.secret).toBe(true)
      // Masking is a display decision — the snippet itself is untouched, so
      // copying it still yields the real thing.
      await expect(store.load(id)).resolves.toBe('sk-live-DEADBEEF')
    })

    it('is off unless asked for', async () => {
      const store = useSnippetStore()
      const id = await store.add({ name: 'Plain', content: 'hello', language: 'auto' })
      expect(store.entries.find((e) => e.id === id).secret).toBe(false)
    })

    it('can be turned on and off again by an edit, without re-keying', async () => {
      const store = useSnippetStore()
      const id = await store.add({ name: 'Token', content: 'abc', language: 'auto' })
      const before = store.entries.find((e) => e.id === id).aadSalt

      await store.update(id, { name: 'Token', content: 'abc', language: 'auto', secret: true })
      expect(store.entries.find((e) => e.id === id).secret).toBe(true)

      await store.update(id, { name: 'Token', content: 'abc', language: 'auto', secret: false })
      const entry = store.entries.find((e) => e.id === id)
      expect(entry.secret).toBe(false)
      expect(entry.aadSalt).toBe(before)
      await expect(store.load(id)).resolves.toBe('abc')
    })

    it('stays secret across a backup and restore', async () => {
      const store = useSnippetStore()
      await store.add({ name: 'Key', content: 'sk-live-1', language: 'auto', secret: true })
      await store.add({ name: 'Note', content: 'plain', language: 'auto' })
      expect((await store.exportAll('pw')).ok).toBe(true)

      setActivePinia(createPinia())
      localStorage.clear()
      const fresh = useSnippetStore()
      await fresh.importSnippets('pw')
      const byName = Object.fromEntries(fresh.entries.map((e) => [e.name, e]))
      // A restored secret that came back unmasked would quietly expose it.
      expect(byName.Key.secret).toBe(true)
      expect(byName.Note.secret).toBe(false)
      await expect(fresh.load(byName.Key.id)).resolves.toBe('sk-live-1')
    })

    it('reads a stored entry as secret only for a real boolean', () => {
      localStorage.setItem(
        'diffbro.snippets',
        JSON.stringify({
          tags: {},
          entries: [
            { id: 'a', name: 'A', tags: [], secret: true },
            { id: 'b', name: 'B', tags: [], secret: 'yes' },
            { id: 'c', name: 'C', tags: [] }
          ]
        })
      )
      const store = useSnippetStore()
      expect(store.entries.map((e) => e.secret)).toEqual([true, false, false])
    })
  })

  // --- export / import ---
  it('exports all and reimports into a fresh store with tags + colors intact', async () => {
    const store = useSnippetStore()
    await store.add({
      name: 'find user',
      content: 'SELECT * FROM users',
      language: 'sql',
      tags: ['sql']
    })
    const color = store.tags.sql.color
    expect((await store.exportAll('my-passphrase')).ok).toBe(true)

    setActivePinia(createPinia())
    localStorage.clear()
    const fresh = useSnippetStore()
    const res = await fresh.importSnippets('my-passphrase')
    expect(res.ok).toBe(true)
    expect(fresh.entries).toHaveLength(1)
    expect(fresh.entries[0].tags).toEqual(['sql'])
    expect(fresh.tags.sql.color).toBe(color)
    await expect(fresh.load(fresh.entries[0].id)).resolves.toBe('SELECT * FROM users')
  })

  it('exportTag exports only snippets carrying that tag', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'Keep', content: 'A', language: 'auto', tags: ['wanted'] })
    await store.add({ name: 'Skip', content: 'B', language: 'auto', tags: ['other'] })
    await store.exportTag('wanted', 'pw')

    setActivePinia(createPinia())
    localStorage.clear()
    const fresh = useSnippetStore()
    await fresh.importSnippets('pw')
    expect(fresh.entries.map((e) => e.name)).toEqual(['Keep'])
  })

  it('imports a legacy { categories } bundle, folding each category into a tag', async () => {
    // A bundle produced by the previous (categories) version.
    lastExportedFile = await sealSnippets(
      {
        categories: [
          { name: 'Default', snippets: [{ name: 'Loose', content: 'x', language: 'auto' }] },
          { name: 'SQL', snippets: [{ name: 'Q', content: 'SELECT 1', language: 'sql' }] }
        ]
      },
      'pw',
      IDENTITY
    )
    const store = useSnippetStore()
    const res = await store.importSnippets('pw')
    expect(res.ok).toBe(true)
    const loose = store.entries.find((e) => e.name === 'Loose')
    const q = store.entries.find((e) => e.name === 'Q')
    expect(loose.tags).toEqual([]) // "Default" category → untagged
    expect(q.tags).toEqual(['sql']) // "SQL" category → sql tag
  })

  it('importSnippets surfaces a friendly message on the wrong passphrase', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'x', content: 'y', language: 'auto', tags: [] })
    await store.exportAll('right-pw')
    const res = await store.importSnippets('wrong-pw')
    expect(res.ok).toBeUndefined()
    expect(res.message).toBeTruthy()
  })

  // --- migration ---
  it('migrates a legacy { categories, entries } blob without re-encrypting (aadSalt = old categoryId)', async () => {
    const id = 'e1'
    const catId = 'c-sql'
    const createdAt = 1700000000000
    // Encrypt exactly as the old store did: AAD = [id, categoryId, createdAt].
    const box = vaultEncrypt(KEY, 'legacy content', [id, catId, createdAt].join('|'))
    localStorage.setItem(
      'diffbro.snippets',
      JSON.stringify({
        categories: [
          { id: 'c-def', name: 'Default', isDefault: true },
          { id: catId, name: 'SQL' }
        ],
        entries: [
          {
            id,
            categoryId: catId,
            name: 'old snippet',
            createdAt,
            language: 'sql',
            favorite: false,
            iv: box.iv,
            data: box.data
          }
        ]
      })
    )
    setActivePinia(createPinia())
    const store = useSnippetStore()
    const migrated = store.entries[0]
    expect(migrated.aadSalt).toBe(catId) // preserves the AAD binding
    expect(migrated.tags).toEqual(['sql']) // category → tag
    expect(store.tags.sql).toBeTruthy()
    // The whole point: content still decrypts after a metadata-only migration.
    await expect(store.load(id)).resolves.toBe('legacy content')
  })

  // The quick look-up window is a separate Pinia instance and calls reload() on
  // each summon to pick up snippets the main window added meanwhile.
  it('reload() re-reads the library persisted by another window', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'First', content: 'x' })
    expect(store.entries.map((e) => e.name)).toEqual(['First'])
    // Simulate the main window persisting a second snippet to disk.
    const raw = JSON.parse(localStorage.getItem('diffbro.snippets'))
    raw.entries.push({ ...raw.entries[0], id: 'other', name: 'Second' })
    localStorage.setItem('diffbro.snippets', JSON.stringify(raw))
    store.reload()
    expect(store.entries.map((e) => e.name)).toEqual(['First', 'Second'])
  })

  // Older/partial records must not crash the sidebar, whose filters do unguarded
  // entry.tags.some / entry.name.toLowerCase.
  it('normalizes an older entry missing tags and name on load', () => {
    localStorage.setItem(
      'diffbro.snippets',
      JSON.stringify({ tags: {}, entries: [{ id: 'x', iv: 'i', data: 'd', createdAt: 1 }] })
    )
    const store = useSnippetStore()
    expect(store.entries[0].tags).toEqual([])
    expect(typeof store.entries[0].name).toBe('string')
  })

  it('drops non-string tags from an older entry on load', () => {
    localStorage.setItem(
      'diffbro.snippets',
      JSON.stringify({
        tags: {},
        entries: [{ id: 'x', iv: 'i', data: 'd', createdAt: 1, name: 'n', tags: ['ok', 5, null] }]
      })
    )
    const store = useSnippetStore()
    expect(store.entries[0].tags).toEqual(['ok'])
  })
})

describe('importFromFile', () => {
  it('imports VS Code snippets into the encrypted store, decryptable again', async () => {
    const store = useSnippetStore()
    window.api.openFile = async () => ({
      name: 'x.code-snippets.json',
      content: JSON.stringify({ Log: { body: ['a', 'b'] }, Hi: { body: 'hello' } })
    })
    const res = await store.importFromFile()
    expect(res).toEqual({ count: 2 })
    const names = store.entries.map((e) => e.name)
    expect(names).toContain('Log')
    expect(names).toContain('Hi')
    const log = store.entries.find((e) => e.name === 'Log')
    expect(await store.load(log.id)).toBe('a\nb')
  })

  it('reports cancellation and the size guard without adding anything', async () => {
    const store = useSnippetStore()
    const before = store.entries.length
    window.api.openFile = async () => null
    expect(await store.importFromFile()).toEqual({ cancelled: true })
    window.api.openFile = async () => ({ name: 'big.txt', content: 'x'.repeat(1_000_001) })
    expect(await store.importFromFile()).toEqual({ error: 'too-large' })
    expect(store.entries.length).toBe(before)
  })
})

// The contract the tool dialog's Save-as-snippet depends on: everything filled
// except the one thing the app cannot infer.
describe('startNewSnippetFrom', () => {
  it('opens the editor with the content and language, and no name', () => {
    const store = useSnippetStore()
    store.startNewSnippetFrom('{"a":1}', 'json')
    expect(store.editingSnippet).toEqual({
      id: null,
      initialContent: '{"a":1}',
      initialLanguage: 'json',
      initialTags: []
    })
  })

  it('falls back to auto-detection when the panel names no language', () => {
    const store = useSnippetStore()
    store.startNewSnippetFrom('plain text', '')
    expect(store.editingSnippet.initialLanguage).toBe('auto')
  })
})

// Mermaid's renderer is a 2.8 MB chunk kept out of the main bundle, so the first
// diagram of a session pays ~400ms for it — long enough to read as a freeze.
// Warming it needs to know whether this library has any diagram at all; warming
// it for someone who has never drawn one is startup work for nothing.
describe('hasDiagrams', () => {
  it('is false for an empty library and for one with no diagrams', () => {
    const store = useSnippetStore()
    expect(store.hasDiagrams).toBe(false)
    store.entries = [
      { id: 'a', language: 'json', detected: 'json' },
      { id: 'b', language: 'auto', detected: 'plaintext' }
    ]
    expect(store.hasDiagrams).toBe(false)
  })

  it('is true when a snippet is a diagram, chosen or detected', () => {
    const store = useSnippetStore()
    store.entries = [{ id: 'a', language: 'mermaid', detected: 'plaintext' }]
    expect(store.hasDiagrams).toBe(true)

    store.entries = [{ id: 'b', language: 'auto', detected: 'mermaid' }]
    expect(store.hasDiagrams).toBe(true)
  })
})
