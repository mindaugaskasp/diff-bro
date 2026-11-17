import { beforeEach, describe, expect, it, vi } from 'vitest'

const deferred = () => {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

const sockets = vi.hoisted(() => ({ listen: null, server: null, discovery: null }))

vi.mock('../../../src/main/lan/privateAddress', () => ({
  privateInterfaceAddresses: () => [{ address: '192.168.1.5', family: 'IPv4' }],
  isPrivateAddress: () => true
}))
vi.mock('../../../src/main/lan/server', () => ({
  listenOnPrivate: () => sockets.listen.promise.then(() => sockets.server)
}))
vi.mock('../../../src/main/lan/discovery', () => ({
  createDiscovery: async () => sockets.discovery
}))

const { createLan } = await import('../../../src/main/lan/lan')

const settings = (enabled) => ({ enabled, visible: true, popups: true, name: 'Ana' })

beforeEach(() => {
  sockets.listen = deferred()
  sockets.server = { port: 4000, close: vi.fn(async () => {}) }
  sockets.discovery = {
    announce: vi.fn(),
    query: vi.fn(),
    sendRaw: vi.fn(async () => {}),
    close: vi.fn(async () => {})
  }
})

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('switching sharing off', () => {
  it('closes both sockets even when it lands while they are still opening', async () => {
    const lan = createLan({ settings: settings(true), selfFp: 'ff'.repeat(16), onChange: () => {} })
    const started = lan.start()
    const stopped = lan.apply(settings(false))
    sockets.listen.resolve()
    await Promise.all([started, stopped])
    await flush()
    expect(sockets.server.close).toHaveBeenCalled()
    expect(sockets.discovery.close).toHaveBeenCalled()
    expect(lan.isOnline()).toBe(false)
    await lan.stop()
  })

  it('still closes the TCP listener when the multicast socket fails to close', async () => {
    sockets.listen.resolve()
    sockets.discovery.close = vi.fn(() => {
      throw new Error('ERR_SOCKET_DGRAM_NOT_RUNNING')
    })
    const lan = createLan({ settings: settings(true), selfFp: 'ff'.repeat(16), onChange: () => {} })
    await lan.start()
    await lan.apply(settings(false)).catch(() => {})
    expect(sockets.server.close).toHaveBeenCalled()
  })
})
