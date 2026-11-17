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
let paired
let useLanStore
const showNotice = vi.fn()
vi.mock('../../../../src/renderer/src/stores/diffStore', () => ({
  useDiffStore: () => ({ showNotice })
}))
beforeEach(async () => {
  vi.resetModules()
  ;({ useLanStore } = await import('../../../../src/renderer/src/features/lan/lanStore'))
  setActivePinia(createPinia())
  changed = null
  window.api = {
    lanState: vi.fn(async () => snapshot()),
    lanUpdate: vi.fn(async (patch) => snapshot(patch)),
    onLanChanged: vi.fn((handler) => (changed = handler)),
    onLanPairing: vi.fn((handler) => (paired = handler)),
    lanAdd: vi.fn(async () => ({ ok: true, id: 'p1' })),
    lanSubmitCode: vi.fn(async () => ({ ok: true, matched: true })),
    lanCancel: vi.fn(async () => ({ ok: true })),
    lanPasteCode: vi.fn(async () => ({ code: 'K7Q4ZP' }))
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

describe('adding someone', () => {
  const ANA = { fp: 'aa'.repeat(16), name: 'Ana' }

  it('shows the add dialog at once, then follows main’s stages', async () => {
    const lan = useLanStore()
    await lan.init()
    const adding = lan.add(ANA)
    expect(lan.pairing).toMatchObject({ role: 'adder', stage: 'connecting', name: 'Ana' })
    await adding
    paired({ id: 'p1', role: 'adder', stage: 'enter-code', fp: ANA.fp, name: 'Ana' })
    expect(lan.pairing.stage).toBe('enter-code')
    await lan.submitCode('K7Q 4ZP')
    expect(window.api.lanSubmitCode).toHaveBeenCalledWith('p1', 'K7Q 4ZP')
  })

  it('says Connection lost when the person cannot be reached', async () => {
    window.api.lanAdd = vi.fn(async () => ({ error: 'not-reachable' }))
    const lan = useLanStore()
    await lan.add(ANA)
    expect(lan.pairing.stage).toBe('connection-lost')
  })

  it('closes the dialog and shows a notice once added', async () => {
    const lan = useLanStore()
    await lan.init()
    paired({ id: 'p1', role: 'adder', stage: 'added', fp: ANA.fp, name: 'Ana' })
    expect(lan.pairing).toBeNull()
    expect(showNotice).toHaveBeenCalled()
  })

  it('cancel tells main and clears the dialog; retry starts again', async () => {
    const lan = useLanStore()
    await lan.init()
    paired({ id: 'p1', role: 'adder', stage: 'enter-code', fp: ANA.fp, name: 'Ana' })
    lan.cancelPairing()
    expect(window.api.lanCancel).toHaveBeenCalledWith('p1')
    expect(lan.pairing).toBeNull()

    paired({ id: 'p2', role: 'adder', stage: 'mismatch', fp: ANA.fp, name: 'Ana' })
    await lan.retryPairing()
    expect(window.api.lanAdd).toHaveBeenLastCalledWith(ANA.fp)
  })

  it('dismissing a result clears it without telling main', async () => {
    const lan = useLanStore()
    await lan.init()
    paired({ id: 'p3', role: 'holder', stage: 'added-you', fp: ANA.fp, name: 'Ana' })
    lan.dismissPairing()
    expect(lan.pairing).toBeNull()
    expect(window.api.lanCancel).not.toHaveBeenCalled()
    expect(await lan.pasteCode()).toEqual({ code: 'K7Q4ZP' })
  })
})
