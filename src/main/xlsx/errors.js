// Shared error type + guards for the OOXML reader. No Electron, no fs — the
// whole reader is pure so it stays unit-testable (see tests/main/xlsx/).

export class XlsxError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'XlsxError'
    // 'bomb' | 'unzip' | 'format' | 'parse' | 'doctype'
    this.code = code
  }
}

// OOXML is always DTD-free. A DOCTYPE is the entry point for XXE and
// billion-laughs entity expansion, so any declaration rejects the whole file
// before a parser ever touches it.
export function rejectDoctype(xml) {
  if (/<!doctype/i.test(xml)) {
    throw new XlsxError('doctype', 'XML DOCTYPE declarations are not allowed in .xlsx')
  }
}

const utf8 = new TextDecoder('utf-8')
export function decodeUtf8(bytes) {
  return utf8.decode(bytes)
}
