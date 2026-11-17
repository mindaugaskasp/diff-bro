import { createPrivateKey, createPublicKey, sign, verify } from 'crypto'

export const REVOKE_FORMAT = 'diffbro-revoke/1'
export const REVOKE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const CLOCK_SKEW_MS = 5 * 60 * 1000

const signed = ({ fp, to, at }) => Buffer.from([REVOKE_FORMAT, fp, to, at].join('|'))

export function signRevoke({ priv, fp, to, at }) {
  const sig = sign(null, signed({ fp, to, at }), createPrivateKey(priv.sign)).toString('base64')
  return { type: 'revoke', fp, at, sig }
}

export function verifyRevoke(frame, { trusted, me, now }) {
  const signer = trusted.find((t) => t.fingerprint === frame.fp)
  if (!signer?.sign) return null
  const fresh = frame.at <= now + CLOCK_SKEW_MS && now - frame.at <= REVOKE_TTL_MS
  if (!fresh) return null
  try {
    const ok = verify(
      null,
      signed({ fp: frame.fp, to: me, at: frame.at }),
      createPublicKey(signer.sign),
      Buffer.from(frame.sig, 'base64')
    )
    return ok ? { fp: signer.fingerprint, name: signer.label } : null
  } catch {
    return null
  }
}
