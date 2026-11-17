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
let arrived
let items
let useLanStore
const showNotice = vi.fn()
vi.mock('../../../../src/renderer/src/stores/diffStore', () => ({
  useDiffStore: () => ({ showNotice })
}))
const openSnippet = vi.fn(() => 'tab-1')
vi.mock('../../../../src/renderer/src/stores/tabsStore', () => ({
  useTabsStore: () => ({ openSnippet, open: vi.fn(() => 'tab-2') })
}))
beforeEach(async () => {
  vi.resetModules()
  ;({ useLanStore } = await import('../../../../src/renderer/src/features/lan/lanStore'))
  setActivePinia(createPinia())
  changed = null
  items = []
  window.api = {
    lanState: vi.fn(async () => snapshot()),
    lanUpdate: vi.fn(async (patch) => snapshot(patch)),
    onLanChanged: vi.fn((handler) => (changed = handler)),
    onLanPairing: vi.fn((handler) => (paired = handler)),
    lanAdd: vi.fn(async () => ({ ok: true, id: 'p1' })),
    lanSubmitCode: vi.fn(async () => ({ ok: true, matched: true })),
    lanCancel: vi.fn(async () => ({ ok: true })),
    lanPasteCode: vi.fn(async () => ({ code: 'K7Q4ZP' })),
    lanItems: vi.fn(async () => items),
    onLanItemArrived: vi.fn((handler) => (arrived = handler)),
    onLanItemsChanged: vi.fn(),
    lanDeclineItem: vi.fn(async () => ({ ok: true })),
    lanOpenItem: vi.fn(async () => ({
      ok: true,
      from: 'Ana',
      entry: { kind: 'snippet', name: 'nginx reload', expiresAt: 9, snippet: { content: 'x' } }
    })),
    lanSilence: vi.fn(async (choice) =>
      snapshot(choice === 'forever' ? { popups: false } : { silencedUntil: Date.now() + 60_000 })
    )
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

describe('items and the bell', () => {
  const ITEM = {
    id: 'i1',
    kind: 'snippet',
    name: 'nginx reload',
    from: 'Ana',
    receivedAt: 1,
    expiresAt: 9
  }

  it('pops an arriving item up while popups are shown', async () => {
    const lan = useLanStore()
    await lan.init()
    items = [ITEM]
    await arrived(ITEM)
    expect(lan.currentOffer).toEqual(ITEM)
  })

  it('keeps it under the bell while silenced', async () => {
    window.api.lanState = vi.fn(async () => snapshot({ silencedUntil: Date.now() + 60_000 }))
    const lan = useLanStore()
    await lan.init()
    items = [ITEM]
    await arrived(ITEM)
    expect(lan.currentOffer).toBeNull()
    expect(lan.showsBell).toBe(true)
    expect(lan.isSilenced).toBe(true)
  })

  it('X declines nothing: the offer goes, the item stays', async () => {
    const lan = useLanStore()
    await lan.init()
    items = [ITEM]
    await arrived(ITEM)
    lan.dismissOffers()
    expect(lan.currentOffer).toBeNull()
    expect(lan.items).toEqual([ITEM])
    expect(window.api.lanDeclineItem).not.toHaveBeenCalled()
  })

  it('Open puts it in a tab marked as received', async () => {
    const lan = useLanStore()
    await lan.init()
    items = [ITEM]
    await arrived(ITEM)
    await lan.openItem('i1')
    expect(openSnippet).toHaveBeenCalled()
    expect(lan.received['tab-1']).toMatchObject({ from: 'Ana' })
    expect(lan.items).toEqual([])
    lan.forgetReceived('tab-1')
    expect(lan.received).toEqual({})
  })

  it('Decline removes it in main', async () => {
    const lan = useLanStore()
    await lan.init()
    items = [ITEM]
    await lan.loadItems()
    await lan.declineItem('i1')
    expect(window.api.lanDeclineItem).toHaveBeenCalledWith('i1')
    expect(lan.items).toEqual([])
  })

  it('says so when an item is no longer there', async () => {
    window.api.lanOpenItem = vi.fn(async () => ({ error: 'gone' }))
    const lan = useLanStore()
    await lan.openItem('i9')
    expect(showNotice).toHaveBeenCalled()
  })

  it('silencing clears the popups and tells main', async () => {
    const lan = useLanStore()
    await lan.init()
    items = [ITEM]
    await arrived(ITEM)
    await lan.silence(60)
    expect(window.api.lanSilence).toHaveBeenCalledWith(60)
    expect(lan.offerQueue).toEqual([])
    expect(lan.isSilenced).toBe(true)
    await lan.silence('forever')
    expect(lan.popups).toBe(false)
  })

  it('an add request waits under the bell while silenced, and Show code opens it', async () => {
    window.api.lanState = vi.fn(async () => snapshot({ popups: false }))
    const lan = useLanStore()
    await lan.init()
    const request = {
      id: 'r1',
      role: 'holder',
      stage: 'show-code',
      name: 'Ben',
      code: 'K7Q4ZP',
      expiresAt: 9
    }
    paired(request)
    expect(lan.pairing).toBeNull()
    expect(lan.liveRequests).toEqual([request])
    lan.showRequest(request)
    expect(lan.pairing).toEqual(request)
    expect(lan.requests).toEqual([])
  })

  it('an ended request stays as a faded row until the bell closes', async () => {
    window.api.lanState = vi.fn(async () => snapshot({ popups: false }))
    const lan = useLanStore()
    await lan.init()
    paired({ id: 'r2', role: 'holder', stage: 'show-code', name: 'Chen', expiresAt: 9 })
    paired({ id: 'r2', role: 'holder', stage: 'expired', name: 'Chen', expiresAt: 9 })
    expect(lan.requests.map((r) => r.stage)).toEqual(['expired'])
    lan.toggleBell()
    expect(lan.bellOpen).toBe(true)
    lan.toggleBell()
    expect(lan.requests).toEqual([])
  })

  it('declining a waiting request cancels it in main', async () => {
    window.api.lanState = vi.fn(async () => snapshot({ popups: false }))
    const lan = useLanStore()
    await lan.init()
    const request = { id: 'r3', role: 'holder', stage: 'show-code', name: 'Ben', expiresAt: 9 }
    paired(request)
    lan.declineRequest(request)
    expect(window.api.lanCancel).toHaveBeenCalledWith('r3')
  })
})
