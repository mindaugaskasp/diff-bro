// A tab and the saved diff it was opened from are the same comparison, so
// saving after an edit rewrites that diff rather than stacking a second copy of
// it beside the first.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import { useSaveDiffTarget } from '../../../src/renderer/src/composables/useSaveDiffTarget'

const KEY = randomBytes(32)
const FILE = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })
const snapshot = (l, r) => ({ mode: 'files', left: FILE(l), right: FILE(r) })

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    vaultEncrypt: async (text, aad) => vaultEncrypt(KEY, text, aad),
    vaultDecrypt: async (box, aad) => vaultDecrypt(KEY, box, aad)
  }
})

// Put a saved diff on screen, in a tab linked to it, the way opening one does.
async function openSaved({ ttlHours = 1, tags = [] } = {}) {
  const vault = useVaultStore()
  const tabs = useTabsStore()
  tabs.init()
  const id = await vault.save('Nightly config', ttlHours, snapshot('a.txt', 'b.txt'), tags)
  tabs.open(snapshot('a.txt', 'b.txt'), { diffSaved: true, entryId: id, name: 'Nightly config' })
  return { vault, tabs, id }
}

describe('where a save lands', () => {
  it('rewrites the diff the tab already is, instead of adding a second one', async () => {
    const { vault, id } = await openSaved()
    const target = useSaveDiffTarget()
    expect(target.isUpdate.value).toBe(true)

    const again = await target.commit({
      name: 'Nightly config',
      ttlHours: 1,
      snapshot: snapshot('a.txt', 'c.txt'),
      tags: []
    })

    expect(again).toBe(id)
    expect(vault.entries).toHaveLength(1)
    await expect(vault.load(id)).resolves.toMatchObject({ right: { name: 'c.txt' } })
  })

  it('keeps the entry’s identity and its star across an update', async () => {
    const { vault, id } = await openSaved()
    vault.toggleFavorite(id)
    const { createdAt } = vault.entries[0]

    await useSaveDiffTarget().commit({
      name: 'Renamed',
      ttlHours: 8,
      snapshot: snapshot('a.txt', 'c.txt'),
      tags: ['nightly']
    })

    const entry = vault.entries[0]
    expect(entry.id).toBe(id)
    expect(entry.createdAt).toBe(createdAt)
    expect(entry.favorite).toBe(true)
    expect(entry.name).toBe('Renamed')
    expect(entry.tags).toContain('nightly')
  })

  it('offers the entry’s own name, tags and expiry back to the dialog', async () => {
    await openSaved({ ttlHours: null, tags: ['nightly'] })
    const { initial } = useSaveDiffTarget()
    expect(initial()).toMatchObject({ name: 'Nightly config', secure: false, tags: ['nightly'] })
  })

  it('makes a NEW diff when the tab is not linked to one', async () => {
    const vault = useVaultStore()
    const tabs = useTabsStore()
    tabs.init()
    useDiffStore().restore(snapshot('a.txt', 'b.txt'))

    const target = useSaveDiffTarget()
    expect(target.isUpdate.value).toBe(false)
    await target.commit({
      name: 'Fresh',
      ttlHours: 1,
      snapshot: snapshot('a.txt', 'b.txt'),
      tags: []
    })
    expect(vault.entries).toHaveLength(1)
  })

  // A diff someone else signed and sent is theirs. Editing it makes a diff of
  // your own rather than rewriting the copy that arrived.
  it('never rewrites a diff that came from someone else', async () => {
    const vault = useVaultStore()
    const tabs = useTabsStore()
    tabs.init()
    const id = await vault.addShared({
      name: 'Theirs',
      payload: snapshot('a.txt', 'b.txt'),
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
      from: 'ab:cd:ef'
    })
    tabs.open(snapshot('a.txt', 'b.txt'), { diffSaved: true, entryId: id, name: 'Theirs' })

    const target = useSaveDiffTarget()
    expect(target.isUpdate.value).toBe(false)
    await target.commit({
      name: 'Mine now',
      ttlHours: 1,
      snapshot: snapshot('a.txt', 'c.txt'),
      tags: []
    })
    expect(vault.entries).toHaveLength(2)
    expect(vault.entries.find((e) => e.id === id).name).toBe('Theirs')
  })
})
