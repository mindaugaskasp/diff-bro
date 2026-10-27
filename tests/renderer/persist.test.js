import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  holdPersisted,
  loadPersisted,
  releasePersisted,
  savePersisted
} from '../../src/renderer/src/persist'

beforeEach(() => {
  localStorage.clear()
  delete window.api
})
afterEach(() => {
  delete window.api
})

function fileStore() {
  const files = {}
  window.api = {
    storeLoad: (name) => files[name] ?? null,
    storeSave: (name, contents) => {
      files[name] = contents
    }
  }
  return files
}

describe('persist (durable store with migration)', () => {
  it('falls back to localStorage when the store IPC is unavailable', () => {
    savePersisted('vault', '{"x":1}')
    expect(localStorage.getItem('diffbro.vault')).toBe('{"x":1}')
    expect(loadPersisted('vault')).toBe('{"x":1}')
  })

  it('reads and writes through the file store when available', () => {
    const files = fileStore()
    savePersisted('snippets', '{"a":2}')
    expect(files.snippets).toBe('{"a":2}')
    expect(loadPersisted('snippets')).toBe('{"a":2}')
    // File store is used, not localStorage.
    expect(localStorage.getItem('diffbro.snippets')).toBeNull()
  })

  it('ignores an old localStorage copy when the file store has none', () => {
    const files = fileStore()
    localStorage.setItem('diffbro.vault', '{"old":true}')
    expect(loadPersisted('vault')).toBeNull()
    expect(files.vault).toBeUndefined()
  })

  it('reads the file store, never a localStorage copy, when the store IPC exists', () => {
    const files = fileStore()
    files.vault = '{"current":1}'
    localStorage.setItem('diffbro.vault', '{"stale":1}')
    expect(loadPersisted('vault')).toBe('{"current":1}')
  })

  it('returns null when nothing is stored anywhere', () => {
    fileStore()
    expect(loadPersisted('vault')).toBeNull()
  })
})

describe('held writes', () => {
  it('keeps the latest write to a held key until released, and drops it on discard', () => {
    const files = fileStore()
    holdPersisted(['settings'])
    savePersisted('settings', 'a')
    savePersisted('settings', 'b')
    savePersisted('vault', 'v')
    expect(files).toEqual({ vault: 'v' })
    releasePersisted(true)
    expect(files.settings).toBe('b')

    holdPersisted(['settings'])
    savePersisted('settings', 'c')
    releasePersisted(false)
    expect(files.settings).toBe('b')
    savePersisted('settings', 'd')
    expect(files.settings).toBe('d')
  })
})
