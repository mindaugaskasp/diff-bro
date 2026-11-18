// The adder commits before seeing the holder's nonce, so a man in the middle gets one guess.
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { CODE_ALPHABET, CODE_LENGTH, normalizeCode } from '../../shared/pairingCodeText'

export { CODE_ALPHABET, CODE_LENGTH, formatCode, normalizeCode } from '../../shared/pairingCodeText'
export const NONCE_BYTES = 32
const CONFIRM_LENGTH = 4

const sha256 = (...parts) => {
  const hash = createHash('sha256')
  for (const part of parts) {
    const bytes = Buffer.from(part)
    const length = Buffer.alloc(4)
    length.writeUInt32BE(bytes.length)
    hash.update(length).update(bytes)
  }
  return hash.digest()
}

export const newNonce = () => randomBytes(NONCE_BYTES).toString('base64')

export const commitmentOf = (nonce) =>
  createHash('sha256').update(Buffer.from(nonce, 'base64')).digest('base64')

function isSameBytes(a, b) {
  return a.length === b.length && timingSafeEqual(a, b)
}

export function isRevealValid(commit, nonce) {
  if (typeof commit !== 'string' || typeof nonce !== 'string') return false
  return isSameBytes(Buffer.from(commitmentOf(nonce)), Buffer.from(commit))
}

function encode(digest, length) {
  let value = BigInt(`0x${digest.toString('hex')}`)
  const base = BigInt(CODE_ALPHABET.length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Number(value % base)]
    value /= base
  }
  return code
}

export const pairingCode = ({ holderFp, adderFp, holderNonce, adderNonce }) =>
  encode(sha256(holderFp, adderFp, holderNonce, adderNonce), CODE_LENGTH)

// Both screens show this after a correct code; the holder adds only when the two match.
export const confirmCode = (code) =>
  encode(sha256('diffbro-confirm/1', normalizeCode(code) ?? ''), CONFIRM_LENGTH)

export function codesMatch(expected, typed) {
  const a = normalizeCode(expected)
  const b = normalizeCode(typed)
  return a !== null && b !== null && isSameBytes(Buffer.from(a), Buffer.from(b))
}
