import { describe, it, expect } from 'vitest'
import { parseJwt, jwtClaims } from '../../../src/renderer/src/utils/jwt'

// The canonical jwt.io HS256 example.
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
  '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('parseJwt', () => {
  it('decodes the header and payload', () => {
    const r = parseJwt(JWT)
    expect(r.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(r.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 })
  })

  it('reports a non-JWT and undecodable input', () => {
    expect(parseJwt('nope').error).toMatch(/Not a JWT/)
    expect(parseJwt('!!!.@@@.sig').error).toMatch(/decode/)
  })
})

describe('jwtClaims', () => {
  it('humanizes the time claims and flags an expired token', () => {
    const now = 1516242622 * 1000 // exactly at exp
    const c = jwtClaims({ alg: 'HS256' }, { iat: 1516239022, exp: 1516242622 }, now)
    expect(c.alg).toBe('HS256')
    expect(c.rows.map((r) => r.key)).toEqual(['iat', 'exp'])
    expect(c.rows[0]).toMatchObject({ epoch: 1516239022, relative: '1 hour ago' })
    expect(c.expired).toBe(true)
  })

  it('flags a token that is not yet valid (nbf in the future)', () => {
    const now = 1000 * 1000
    const c = jwtClaims({}, { nbf: 2000 }, now)
    expect(c.notYetValid).toBe(true)
    expect(c.expired).toBe(false)
    expect(c.alg).toBe('—')
  })
})
