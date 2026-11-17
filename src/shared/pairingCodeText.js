export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 6

export function normalizeCode(text) {
  if (typeof text !== 'string') return null
  const code = text.toUpperCase().replace(/[\s-]/g, '')
  if (code.length !== CODE_LENGTH) return null
  return [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null
}

export const formatCode = (code) => `${code.slice(0, 3)} ${code.slice(3)}`
