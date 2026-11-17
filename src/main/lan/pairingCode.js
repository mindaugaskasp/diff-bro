// Short authentication string for adding someone on the network. The adder
// commits to its nonce before seeing the holder's, so a man in the middle gets
// one guess per request instead of a search; see specs/2026-11-17-lan-sharing.
import { createHash, randomBytes, timingSafeEqual } from 'crypto'

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 6
export const NONCE_BYTES = 32

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

export function pairingCode({ holderFp, adderFp, holderNonce, adderNonce }) {
  let value = BigInt(`0x${sha256(holderFp, adderFp, holderNonce, adderNonce).toString('hex')}`)
  const base = BigInt(CODE_ALPHABET.length)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Number(value % base)]
    value /= base
  }
  return code
}

export function normalizeCode(text) {
  if (typeof text !== 'string') return null
  const code = text.toUpperCase().replace(/[\s-]/g, '')
  if (code.length !== CODE_LENGTH) return null
  return [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null
}

export function codesMatch(expected, typed) {
  const a = normalizeCode(expected)
  const b = normalizeCode(typed)
  return a !== null && b !== null && isSameBytes(Buffer.from(a), Buffer.from(b))
}

export const formatCode = (code) => `${code.slice(0, 3)} ${code.slice(3)}`
