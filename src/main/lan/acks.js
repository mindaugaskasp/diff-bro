import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'crypto'

// Signed by the recipient over what it received, so only the real key holder can claim delivery.
const ACK_FORMAT = 'diffbro-ack/1'

export const digestOf = (bytes) => createHash('sha256').update(bytes).digest('base64')

const message = ({ kind, digest, ok, reason = '' }) =>
  Buffer.from([ACK_FORMAT, kind, digest, ok ? '1' : '0', reason].join('|'))

export const signAck = (priv, fields) =>
  sign(null, message(fields), createPrivateKey(priv.sign)).toString('base64')

export function verifyAck(signKey, fields, sig) {
  if (typeof sig !== 'string' || !signKey) return false
  try {
    return verify(null, message(fields), createPublicKey(signKey), Buffer.from(sig, 'base64'))
  } catch {
    return false
  }
}
