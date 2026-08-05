// The OS FILE flavours, built as buffers — the write counterpart to
// clipboardFiles.js. Pure on purpose: it returns what to put on the clipboard
// and never touches electron, so every layout is unit-tested by round-tripping
// it back through the readers that already exist.

// The desktops whose file flavours we know. Anything else gets nothing, and
// the UI hides Copy as file rather than offering one that does nothing.
const FREEDESKTOP = new Set(['linux', 'freebsd', 'openbsd', 'netbsd', 'sunos'])

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

// Windows FILEDESCRIPTORW: a fixed 592-byte record, of which the last 520 are
// cFileName as WCHAR[MAX_PATH].
const DESCRIPTOR_BYTES = 592
const NAME_BYTES = 260 * 2
const NAME_AT = 72
const FD_ATTRIBUTES = 0x04
const FD_WRITESTIME = 0x20
const FD_FILESIZE = 0x40
const FILE_ATTRIBUTE_NORMAL = 0x80
// FILETIME counts 100ns ticks from 1601-01-01; Date counts ms from 1970-01-01.
const FILETIME_EPOCH_OFFSET_MS = 11_644_473_600_000

// Descriptor-based, not CF_HDROP: a format NAME becomes a format through
// RegisterClipboardFormat, and the predefined CF_HDROP has no name to register —
// writing under it minted a private format only this app could paste. See
// docs/standards.md rule 7 before simplifying this back.
function windowsFlavours(paths, bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.alloc(0)
  const name = paths[0].split(/[\\/]/).pop()
  const dropEffect = Buffer.alloc(4)
  dropEffect.writeUInt32LE(1, 0) // DROPEFFECT_COPY — never move the staged file
  return [
    { format: 'FileGroupDescriptorW', buffer: fileGroupDescriptor(name, content.length) },
    { format: 'FileContents', buffer: content },
    { format: 'Preferred DropEffect', buffer: dropEffect },
    // Inert to other applications, and the only thing clipboardFiles.js knows
    // how to find — this is what keeps a DiffBro-to-DiffBro paste working.
    { format: 'CF_HDROP', buffer: hdrop(paths) }
  ]
}

/**
 * FILEGROUPDESCRIPTORW for a single file — the shell's "here is a file, ask me
 * for its bytes" announcement.
 * @param {string} name  basename as the receiver should save it
 * @param {number} size  byte count, carried as a 64-bit value
 * @returns {Buffer}
 */
export function fileGroupDescriptor(name, size) {
  const buf = Buffer.alloc(4 + DESCRIPTOR_BYTES)
  buf.writeUInt32LE(1, 0) // cItems
  const fd = 4
  buf.writeUInt32LE(FD_ATTRIBUTES | FD_WRITESTIME | FD_FILESIZE, fd)
  buf.writeUInt32LE(FILE_ATTRIBUTE_NORMAL, fd + 36)
  const ticks = BigInt(Date.now() + FILETIME_EPOCH_OFFSET_MS) * 10_000n
  buf.writeUInt32LE(Number(ticks & 0xffff_ffffn), fd + 56) // ftLastWriteTime
  buf.writeUInt32LE(Number(ticks >> 32n), fd + 60)
  buf.writeUInt32LE(Math.floor(size / 2 ** 32), fd + 64) // nFileSizeHigh
  buf.writeUInt32LE(size >>> 0, fd + 68) // nFileSizeLow
  // Truncated to leave room for the terminator: an unterminated cFileName runs
  // into whatever follows it in the receiver's copy of the struct.
  const encoded = Buffer.from(String(name).slice(0, 259), 'ucs2')
  encoded.copy(buf, fd + NAME_AT, 0, Math.min(encoded.length, NAME_BYTES - 2))
  return buf
}

/**
 * Every flavour for this platform, as { format, buffer } pairs in the order they
 * should be written.
 * @param {{ paths: string[], platform: NodeJS.Platform, bytes?: Buffer }} spec
 *   `bytes` is the staged file's content, needed only by Windows. Omitting it
 *   still yields the platform's format list, which is how the support probe asks
 *   whether a file can be copied here at all.
 * @returns {Array<{ format: string, buffer: Buffer }>}
 */
export function fileFlavours({ paths, platform, bytes } = {}) {
  const list = (paths ?? []).filter((p) => typeof p === 'string' && p)
  if (!list.length) return []
  if (platform === 'darwin') {
    return [
      { format: 'NSFilenamesPboardType', buffer: filenamesPlist(list) },
      { format: 'public.file-url', buffer: Buffer.from(fileUrl(list[0]), 'utf8') }
    ]
  }
  if (platform === 'win32') return windowsFlavours(list, bytes)
  // Named rather than defaulted: the freedesktop flavours are what X11/Wayland
  // read, and returning them for an unknown platform made canWriteFile
  // unconditionally true — so "an unsupported platform hides the command"
  // silently became "every platform claims support".
  if (FREEDESKTOP.has(platform)) {
    return [
      { format: 'text/uri-list', buffer: Buffer.from(uriList(list), 'utf8') },
      {
        format: 'x-special/gnome-copied-files',
        buffer: Buffer.from(gnomeCopiedFiles(list), 'utf8')
      }
    ]
  }
  return []
}
