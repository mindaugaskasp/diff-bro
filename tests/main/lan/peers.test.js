import { describe, expect, it } from 'vitest'
import { MAX_PER_ADDRESS, MAX_PEERS, createPeerTable, peerRows } from '../../../src/main/lan/peers'

const A = 'aa'.repeat(16)
const B = 'bb'.repeat(16)
const seen = (fp, extra = {}) => ({
  fp,
  name: 'Ana',
  port: 4000,
  address: '192.168.1.5',
  ttl: 120,
  ...extra
})

describe('peer table', () => {
  it('lists peers without their addresses', () => {
    const table = createPeerTable()
    table.saw(seen(A), 0)
    expect(table.list()).toEqual([{ fp: A, name: 'Ana' }])
    expect(table.endpointOf(A)).toEqual({ address: '192.168.1.5', port: 4000 })
  })

  it('renames in place, and moves once the old address said goodbye', () => {
    const table = createPeerTable()
    table.saw(seen(A), 0)
    table.saw(seen(A, { name: 'Ana P', port: 5000 }), 10)
    expect(table.list()).toEqual([{ fp: A, name: 'Ana P' }])
    table.saw(seen(A, { ttl: 0 }), 20)
    table.saw(seen(A, { name: 'Ana P', address: '10.0.0.9', port: 5000 }), 30)
    expect(table.endpointOf(A)).toEqual({ address: '10.0.0.9', port: 5000 })
  })

  it('removes a peer on goodbye', () => {
    const table = createPeerTable()
    table.saw(seen(A), 0)
    expect(table.saw(seen(A, { ttl: 0 }), 1)).toBe(true)
    expect(table.list()).toEqual([])
    expect(table.endpointOf(A)).toBeNull()
  })

  it('expires peers not heard from within their TTL', () => {
    const table = createPeerTable()
    table.saw(seen(A, { ttl: 10 }), 0)
    table.saw(seen(B, { ttl: 120 }), 0)
    expect(table.expire(11_000)).toBe(true)
    expect(table.list().map((p) => p.fp)).toEqual([B])
    expect(table.expire(12_000)).toBe(false)
  })

  it('ignores itself and says when nothing changed', () => {
    const table = createPeerTable({ self: A })
    expect(table.saw(seen(A), 0)).toBe(false)
    expect(table.saw(seen(B), 0)).toBe(true)
    expect(table.saw(seen(B), 5)).toBe(false)
    expect(table.list().map((p) => p.fp)).toEqual([B])
  })

  it('sorts by name and forgets everything on clear', () => {
    const table = createPeerTable()
    table.saw(seen(A, { name: 'Zed' }), 0)
    table.saw(seen(B, { name: 'Ana' }), 0)
    expect(table.list().map((p) => p.name)).toEqual(['Ana', 'Zed'])
    table.clear()
    expect(table.list()).toEqual([])
  })

  it('holds a bounded number of peers, so announcements cannot grow it without limit', () => {
    const table = createPeerTable()
    for (let i = 0; i < MAX_PEERS + 50; i++) {
      const address = `10.0.${i >> 8}.${i & 255}`
      table.saw(seen(i.toString(16).padStart(32, '0'), { address }), 0)
    }
    expect(table.list()).toHaveLength(MAX_PEERS)
  })
})

describe('spoofed announcements', () => {
  const fp = (i) => i.toString(16).padStart(32, '0')

  it('clamps a huge TTL, so a forged entry cannot outlive a real announcement', () => {
    const table = createPeerTable()
    table.saw(seen(A, { ttl: 2 ** 32 - 1 }), 0)
    table.expire(121_000)
    expect(table.list()).toEqual([])
  })

  it('keeps only a few fingerprints per address, so one host cannot fill the table', () => {
    const table = createPeerTable()
    for (let i = 1; i <= MAX_PER_ADDRESS + 3; i++) table.saw(seen(fp(i)), 0)
    expect(table.list()).toHaveLength(MAX_PER_ADDRESS)
    table.saw(seen(B, { address: '192.168.1.9' }), 0)
    expect(table.endpointOf(B)).not.toBeNull()
  })

  it('ignores a goodbye from an address other than the one the peer announced from', () => {
    const table = createPeerTable()
    table.saw(seen(A), 0)
    table.saw(seen(A, { ttl: 0, address: '192.168.1.66' }), 1)
    expect(table.endpointOf(A)).toEqual({ address: '192.168.1.5', port: 4000 })
    table.saw(seen(A, { ttl: 0 }), 2)
    expect(table.endpointOf(A)).toBeNull()
  })

  it('keeps the first address for a fingerprint until that entry lapses', () => {
    const table = createPeerTable()
    table.saw(seen(A), 0)
    table.saw(seen(A, { address: '192.168.1.66', port: 6666 }), 1000)
    expect(table.endpointOf(A)).toEqual({ address: '192.168.1.5', port: 4000 })
    table.saw(seen(A, { address: '192.168.1.66', port: 6666 }), 121_000)
    expect(table.endpointOf(A)).toEqual({ address: '192.168.1.66', port: 6666 })
  })
})

describe('peerRows', () => {
  it('names someone you added by your own label, not by what they announce', () => {
    const trusted = [{ fingerprint: A, label: 'Bob' }]
    expect(
      peerRows(
        [
          { fp: A, name: 'Alice' },
          { fp: B, name: 'Alice' }
        ],
        trusted
      )
    ).toEqual([
      { fp: A, name: 'Bob', trusted: true },
      { fp: B, name: 'Alice', trusted: false }
    ])
  })
})

describe('versions', () => {
  it('lists each peer with the protocol version it announced', () => {
    const table = createPeerTable()
    table.saw(seen(A, { version: 1 }), 0)
    table.saw(seen(B, { name: 'Ben', version: 2, address: '192.168.1.6' }), 0)
    expect(table.list()).toEqual([
      { fp: A, name: 'Ana', version: 1 },
      { fp: B, name: 'Ben', version: 2 }
    ])
  })
})
