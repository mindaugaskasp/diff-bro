import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const snapshot = (over = {}) => ({
  enabled: true,
  visible: true,
  popups: true,
  silencedUntil: 0,
  name: 'Jonas’s MacBook Pro',
  online: true,
  peers: [{ fp: 'aa'.repeat(16), name: 'Ana', trusted: true }],
  ...over
})

let changed
let useLanStore
beforeEach(async () => {
  vi.resetModules()
  ;({ useLanStore } = await import('../../../../src/renderer/src/features/lan/lanStore'))
  setActivePinia(createPinia())
  changed = null
  window.api = {
    lanState: vi.fn(async () => snapshot()),
    lanUpdate: vi.fn(async (patch) => snapshot(patch)),
    onLanChanged: vi.fn((handler) => (changed = handler))
  }
})

describe('lan store', () => {
  it('starts empty and loads the snapshot from main', async () => {
    const lan = useLanStore()
    expect(lan.loaded).toBe(false)
    await lan.init()
    expect(lan.loaded).toBe(true)
    expect(lan.name).toBe('Jonas’s MacBook Pro')
    expect(lan.isActive).toBe(true)
  })

  it('follows changes pushed by main', async () => {
    const lan = useLanStore()
    await lan.init()
    changed(snapshot({ online: false, peers: [] }))
    expect(lan.isActive).toBe(false)
    expect(lan.peers).toEqual([])
  })

  it('subscribes to main only once', async () => {
    const lan = useLanStore()
    await lan.init()
    await lan.init()
    expect(window.api.onLanChanged.mock.calls.length).toBeLessThanOrEqual(1)
  })

  it('sends a patch and takes main’s answer', async () => {
    const lan = useLanStore()
    await lan.update({ visible: false })
    expect(window.api.lanUpdate).toHaveBeenCalledWith({ visible: false })
    expect(lan.visible).toBe(false)
  })

  it('reaches only peers on the network while sharing is on', async () => {
    const lan = useLanStore()
    await lan.init()
    expect([...lan.reachable]).toEqual(['aa'.repeat(16)])
    lan.applySnapshot(snapshot({ enabled: false }))
    expect([...lan.reachable]).toEqual([])
  })

  it('ignores a malformed snapshot', () => {
    const lan = useLanStore()
    lan.applySnapshot(null)
    expect(lan.loaded).toBe(false)
  })
})
