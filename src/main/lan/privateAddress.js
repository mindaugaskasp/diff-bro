import { isIPv4, isIPv6 } from 'net'

const V4_PRIVATE = [
  [10, 0, 8],
  [172, 16, 12],
  [192, 168, 16],
  [169, 254, 16],
  [127, 0, 8]
]

function v4ToInt(ip) {
  return ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0
}

function isPrivateV4(ip) {
  const n = v4ToInt(ip)
  return V4_PRIVATE.some(([a, b, bits]) => {
    const base = v4ToInt(`${a}.${b}.0.0`)
    const mask = (0xffffffff << (32 - bits)) >>> 0
    return (n & mask) >>> 0 === base
  })
}

function isPrivateV6(ip) {
  const lower = ip.toLowerCase()
  if (lower === '::1') return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (mapped) return isIPv4(mapped[1]) && isPrivateV4(mapped[1])
  const head = parseInt(lower.split(':')[0] || '0', 16)
  return (head & 0xfe00) === 0xfc00 || (head & 0xffc0) === 0xfe80
}

export function isPrivateAddress(address) {
  if (typeof address !== 'string') return false
  const ip = address.split('%')[0]
  if (isIPv4(ip)) return isPrivateV4(ip)
  return isIPv6(ip) && isPrivateV6(ip)
}

export function privateInterfaceAddresses(table) {
  const out = []
  for (const [name, entries] of Object.entries(table ?? {})) {
    for (const { address, family, internal, scopeid } of entries ?? []) {
      if (internal || !isPrivateAddress(address)) continue
      out.push(
        scopeid === undefined ? { address, family, name } : { address, family, name, scopeid }
      )
    }
  }
  return out
}

export const reachableAt = (named, source) => (named && isPrivateAddress(named) ? named : source)
