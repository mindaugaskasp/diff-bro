export const MAX_PEERS = 256

const sameEntry = (a, b) => a && a.name === b.name && a.address === b.address && a.port === b.port

export function createPeerTable({ self = null } = {}) {
  const peers = new Map()
  return {
    saw({ fp, name, port, address, ttl }, now) {
      if (fp === self) return false
      if (ttl === 0) return peers.delete(fp)
      if (!peers.has(fp) && peers.size >= MAX_PEERS) return false
      const next = { fp, name, port, address, expiresAt: now + ttl * 1000 }
      const changed = !sameEntry(peers.get(fp), next)
      peers.set(fp, next)
      return changed
    },
    expire(now) {
      let changed = false
      for (const [fp, peer] of peers) {
        if (peer.expiresAt > now) continue
        peers.delete(fp)
        changed = true
      }
      return changed
    },
    list() {
      return [...peers.values()]
        .map(({ fp, name }) => ({ fp, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    endpointOf(fp) {
      const peer = peers.get(fp)
      return peer ? { address: peer.address, port: peer.port } : null
    },
    clear() {
      peers.clear()
    }
  }
}
