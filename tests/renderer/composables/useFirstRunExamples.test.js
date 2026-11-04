import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { seedFirstRunExamples } from '../../../src/renderer/src/composables/useFirstRunExamples'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'

const V2 = 'Example — Mermaid diagram, v2'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    vaultEncrypt: async (plaintext) => ({ iv: 'iv', data: plaintext }),
    vaultDecrypt: async (box) => box.data
  }
})

describe('seeding the first-run examples', () => {
  it('gives a fresh install the v2 diagram beside the other examples', async () => {
    await seedFirstRunExamples()
    const names = useSnippetStore().entries.map((e) => e.name)
    expect(names).toContain(V2)
    expect(names).toHaveLength(3)
    expect(useSettingsStore().examplesSeeded).toBe(true)
  })

  it('adds nothing for a profile that was seeded by an older version', async () => {
    useSettingsStore().markExamplesSeeded()
    await seedFirstRunExamples()
    expect(useSnippetStore().entries).toHaveLength(0)
  })

  it('adds nothing to a library that already holds snippets', async () => {
    const snippets = useSnippetStore()
    await snippets.add({ name: 'Mine', content: 'x', marks: false })
    await seedFirstRunExamples()
    expect(snippets.entries.map((e) => e.name)).toEqual(['Mine'])
    expect(useSettingsStore().examplesSeeded).toBe(true)
  })

  it('tries again next launch when the vault key is unavailable', async () => {
    window.api.vaultEncrypt = async () => ({ error: 'vault-key-unavailable' })
    await seedFirstRunExamples()
    expect(useSettingsStore().examplesSeeded).toBe(false)
  })
})
