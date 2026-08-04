// The OS FILE flavours, built as buffers — the write counterpart to
// clipboardFiles.js. Pure on purpose: it returns what to put on the clipboard
// and never touches electron, so every layout is unit-tested by round-tripping
// it back through the readers that already exist.

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => XML_ESCAPES[c])

// A path is a URL path segment-wise: encodeURI would leave '#' and '?' intact,
// and both are legal in a filename.
const fileUrl = (path) => {
  const leading = path.startsWith('/') ? '' : '/'
  return `file://${leading}${path.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * macOS NSFilenamesPboardType. Written as an XML plist — the pasteboard accepts
 * it on write, and only reading has to cope with the binary form.
 * @param {string[]} paths
 * @returns {Buffer}
 */
export function filenamesPlist(paths) {
  const items = paths.map((p) => `\t<string>${escapeXml(p)}</string>`).join('\n')
  return Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
      `<plist version="1.0">\n<array>\n${items}\n</array>\n</plist>\n`,
    'utf8'
  )
}

/**
 * Windows CF_HDROP: a 20-byte DROPFILES header (offset, 8 bytes of drop point,
 * fNC, fWide) followed by a double-null-terminated UTF-16LE path list.
 * @param {string[]} paths
 * @returns {Buffer}
 */
export function hdrop(paths) {
  const header = Buffer.alloc(20)
  header.writeUInt32LE(20, 0)
  header.writeUInt32LE(1, 16) // fWide: the list below is UTF-16
  const list = Buffer.from(`${paths.map((p) => p.replace(/\//g, '\\')).join('\0')}\0\0`, 'ucs2')
  return Buffer.concat([header, list])
}

/**
 * @param {string[]} paths
 * @returns {string}
 */
export const uriList = (paths) => paths.map(fileUrl).join('\r\n')

// GNOME reads the operation from the first line; without it a paste into Files
// is ignored rather than treated as a copy.
export const gnomeCopiedFiles = (paths) => `copy\n${paths.map(fileUrl).join('\n')}`

/**
 * Every flavour for this platform, as { format, buffer } pairs in the order they
 * should be written.
 * @param {string[]} paths
 * @param {NodeJS.Platform} platform
 * @returns {Array<{ format: string, buffer: Buffer }>}
 */
export function fileFlavours(paths, platform) {
  const list = (paths ?? []).filter((p) => typeof p === 'string' && p)
  if (!list.length) return []
  if (platform === 'darwin') {
    return [
      { format: 'NSFilenamesPboardType', buffer: filenamesPlist(list) },
      { format: 'public.file-url', buffer: Buffer.from(fileUrl(list[0]), 'utf8') }
    ]
  }
  if (platform === 'win32') {
    return [{ format: 'CF_HDROP', buffer: hdrop(list) }]
  }
  return [
    { format: 'text/uri-list', buffer: Buffer.from(uriList(list), 'utf8') },
    { format: 'x-special/gnome-copied-files', buffer: Buffer.from(gnomeCopiedFiles(list), 'utf8') }
  ]
}
