export const MAX_PEERS = 256
export const MAX_PER_ADDRESS = 16
const TTL_CAP_S = 120

const sameEntry = (a, b) =>
  a && a.name === b.name && a.address === b.address && a.port === b.port && a.version === b.version

function hasRoomFor(peers, address) {
  if (peers.size >= MAX_PEERS) return false
  let atAddress = 0
  for (const peer of peers.values()) if (peer.address === address) atAddress++
  return atAddress < MAX_PER_ADDRESS
}

export function createPeerTable({ self = null } = {}) {
  const peers = new Map()
  return {
    saw({ fp, name, port, address, ttl, version }, now) {
      if (fp === self) return false
      const current = peers.get(fp)
      // A live entry keeps its address: anyone can announce someone else's fingerprint.
      if (current && current.expiresAt > now && current.address !== address) return false
      if (ttl === 0) return peers.delete(fp)
      if (!current && !hasRoomFor(peers, address)) return false
      const next = {
        fp,
        name,
        port,
        address,
        version,
        expiresAt: now + Math.min(ttl, TTL_CAP_S) * 1000
      }
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
        .map(({ fp, name, version }) => ({ fp, name, version }))
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

export const peerRows = (peers, trusted) =>
  peers.map((peer) => {
    const own = trusted.find((t) => t.fingerprint === peer.fp)
    return { ...peer, name: own?.label ?? peer.name, trusted: !!own }
  })
