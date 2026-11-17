import { describe, expect, it } from 'vitest'
import { MAX_PEERS, createPeerTable } from '../../../src/main/lan/peers'

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

  it('updates a peer that moves or renames', () => {
    const table = createPeerTable()
    table.saw(seen(A), 0)
    table.saw(seen(A, { name: 'Ana P', address: '10.0.0.9', port: 5000 }), 10)
    expect(table.list()).toEqual([{ fp: A, name: 'Ana P' }])
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
    for (let i = 0; i < MAX_PEERS + 50; i++) table.saw(seen(i.toString(16).padStart(32, '0')), 0)
    expect(table.list()).toHaveLength(MAX_PEERS)
  })
})
