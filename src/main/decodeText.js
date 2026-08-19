import chardet from 'chardet'

// Decoding a file's bytes. Pure, so the encodings it has to get right are
// unit-testable without Electron or a real file.
//
// TextDecoder rather than a library: Electron ships full ICU, so the WHATWG
// label set already covers what chardet detects, and it strips the BOM and
// substitutes U+FFFD for bad bytes on its own. One difference worth knowing —
// WHATWG maps `ISO-8859-1` onto windows-1252, so bytes 0x80-0x9F decode as the
// Windows characters a file of that vintage almost always meant.

const FALLBACK = 'UTF-8'

const decoderFor = (label) => {
  try {
    return new TextDecoder(label)
  } catch {
    return null
  }
}

/**
 * @param {Buffer|Uint8Array} buffer
 * @param {string|null} label  chardet's guess — a hint, not a promise the
 *                             platform knows it
 * @returns {{ content: string, encoding: string }}
 */
export function decodeBuffer(buffer, label) {
  const decoder = label ? decoderFor(label) : null
  return {
    content: (decoder ?? new TextDecoder(FALLBACK)).decode(buffer),
    encoding: decoder ? label : FALLBACK
  }
}

/**
 * @param {Buffer|Uint8Array} buffer
 * @returns {{ content: string, encoding: string }}
 */
export function decodeText(buffer) {
  return decodeBuffer(buffer, chardet.detect(buffer) ?? FALLBACK)
}
