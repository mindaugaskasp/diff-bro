import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadPersisted, savePersisted } from '../../src/renderer/src/persist'

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

  it('migrates the old localStorage copy into the file store, keeping a fallback', () => {
    const files = fileStore()
    localStorage.setItem('diffbro.vault', '{"legacy":true}')
    // File store empty -> returns the legacy value AND copies it forward.
    expect(loadPersisted('vault')).toBe('{"legacy":true}')
    expect(files.vault).toBe('{"legacy":true}')
    // localStorage is left intact as a safety net.
    expect(localStorage.getItem('diffbro.vault')).toBe('{"legacy":true}')
  })

  it('prefers the file store over a stale localStorage copy once migrated', () => {
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
