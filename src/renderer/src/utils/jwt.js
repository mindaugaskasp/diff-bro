// JWT decode + claim humanizing for the JWT tool. Pure so it unit-tests without a
// DOM; ToolJwt.vue is the only UI. The signature is never verified — a decoder
// reads the payload, it does not trust it.
import { relativeTime } from './epoch'

function b64urlDecode(part) {
  const b64 = String(part).replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  const bytes = Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Split a JWT and decode its header + payload JSON (base64url).
 * @param {string} token
 * @returns {{ header: object, payload: object } | { error: string }}
 */
export function parseJwt(token) {
  const parts = String(token).trim().split('.')
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return { error: 'Not a JWT — expected header.payload.signature.' }
  }
  try {
    return {
      header: JSON.parse(b64urlDecode(parts[0])),
      payload: JSON.parse(b64urlDecode(parts[1]))
    }
  } catch {
    return { error: 'Could not decode the header or payload.' }
  }
}

const TIME_CLAIMS = ['iat', 'nbf', 'exp']
const absolute = (ms) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })

/**
 * alg + humanized time claims (iat/nbf/exp) + validity flags.
 * @returns {{ alg: string, rows: Array<{key:string,epoch:number,when:string,relative:string}>,
 *   expired: boolean, notYetValid: boolean }}
 */
export function jwtClaims(header, payload, now = Date.now()) {
  const p = payload ?? {}
  const rows = TIME_CLAIMS.filter((k) => typeof p[k] === 'number').map((k) => {
    const ms = p[k] * 1000
    return { key: k, epoch: p[k], when: absolute(ms), relative: relativeTime(ms - now) }
  })
  return {
    alg: header?.alg ?? '—',
    rows,
    expired: typeof p.exp === 'number' && p.exp * 1000 <= now,
    notYetValid: typeof p.nbf === 'number' && p.nbf * 1000 > now
  }
}
