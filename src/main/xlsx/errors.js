export class XlsxError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'XlsxError'
    // 'bomb' | 'unzip' | 'format' | 'parse' | 'doctype'
    this.code = code
  }
}

// A DOCTYPE is the entry point for XXE / billion-laughs, so any declaration
// rejects the whole file before a parser touches it. OOXML is always DTD-free.
export function rejectDoctype(xml) {
  if (/<!doctype/i.test(xml)) {
    throw new XlsxError('doctype', 'XML DOCTYPE declarations are not allowed in .xlsx')
  }
}

const utf8 = new TextDecoder('utf-8')
export function decodeUtf8(bytes) {
  return utf8.decode(bytes)
}
