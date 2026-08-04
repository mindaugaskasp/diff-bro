// Getting a comparison back out: patches, HTML, and the config backup bundle.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

describe('applyPatch', () => {
  const PATCH = '--- original\n+++ changed\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n'
  const pick = (base, patch) => async (side) =>
    side === 'base'
      ? { path: '/tmp/config.js', name: 'config.js', content: base }
      : { name: 'change.patch', content: patch }

  it('opens base ↔ patched from the chosen files', async () => {
    const store = useDiffStore()
    window.api.openFile = pick('a\nb\nc\n', PATCH)
    await store.applyPatch()
    expect(store.left).toEqual({ path: '/tmp/config.js', name: 'config.js', content: 'a\nb\nc\n' })
    expect(store.right).toEqual({ path: null, name: 'config.js (patched)', content: 'a\nB\nc\n' })
    expect(store.mode).toBe('files')
  })

  it('does nothing when the base pick is cancelled', async () => {
    const store = useDiffStore()
    window.api.openFile = async () => null
    await store.applyPatch()
    expect(store.left).toBeNull()
    expect(store.right).toBeNull()
  })

  it('rejects a file that is not a unified diff without loading anything', async () => {
    const store = useDiffStore()
    window.api.openFile = pick('a\nb\nc\n', 'not a patch')
    await store.applyPatch()
    expect(store.left).toBeNull()
    expect(store.right).toBeNull()
  })
})

describe('exportDiff', () => {
  it('builds a self-contained HTML doc and hands it to the save IPC', async () => {
    const store = useDiffStore()
    store.left = { path: null, name: 'a.js', content: 'a\nb\n' }
    store.right = { path: null, name: 'b.js', content: 'a\nB\n' }
    let sent = null
    window.api.exportDiffFile = async (payload) => {
      sent = payload
      return { ok: true, path: '/tmp/out.html' }
    }
    await store.exportDiff()
    expect(sent.name).toBe('a.js-vs-b.js')
    expect(sent.format).toBe('html')
    expect(sent.text).toContain('<!doctype html>')
    expect(sent.text).toContain('a.js ↔ b.js')
  })

  it('does nothing (no IPC) when there is nothing to compare', async () => {
    const store = useDiffStore()
    let called = false
    window.api.exportDiffFile = async () => {
      called = true
      return { ok: true }
    }
    await store.exportDiff()
    expect(called).toBe(false)
  })
})

// The bundle carried `session` from the start; without this it was sealed into
// the archive and silently dropped on the way back.
