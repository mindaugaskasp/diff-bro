// Absolute paths from the clipboard's FILE flavours. Copying files in a file
// manager also puts a plain-text flavour on the clipboard holding just their
// names, so reading text alone pastes "a.txt\nb.txt" instead of opening them.
//
// Paths here are untrusted: the caller still gates them through allow() before
// anything is read (rule 6).

function fileUrlToPath(uri) {
  const trimmed = String(uri || '').trim()
  if (!trimmed.toLowerCase().startsWith('file://')) return null
  try {
    const { pathname, hostname } = new URL(trimmed)
    if (hostname && hostname !== 'localhost') return null // a remote URL, not a file
    const path = decodeURIComponent(pathname)
    return path.startsWith('/') ? path : null
  } catch {
    return null
  }
}

/**
 * X11 / Wayland, and the drag-and-drop flavour everywhere.
 * @param {string} text
 * @returns {string[]}
 */
export function pathsFromUriList(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#')) // # lines are comments
    .map(fileUrlToPath)
    .filter(Boolean)
}

const XML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }

/**
 * macOS NSFilenamesPboardType — an XML plist of plain paths.
 * @param {string} xml
 * @returns {string[]}
 */
export function pathsFromPlist(xml) {
  const out = []
  for (const [, raw] of String(xml || '').matchAll(/<string>([\s\S]*?)<\/string>/g)) {
    const path = raw.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m]).trim()
    if (path.startsWith('/')) out.push(path)
  }
  return out
}

// macOS writes NSFilenamesPboardType as a BINARY plist, and it is the only
// flavour carrying every copied file — the URL flavours hold just the first.
// Rather than decode the whole format, walk its string objects: 0x5X is ASCII
// and 0x6X UTF-16BE, with the length inline for short strings and in a trailing
// int for longer ones.
/**
 * @param {Buffer} buf
 * @returns {string[]} absolute paths, in clipboard order
 */
// One string object: 0x5X is ASCII, 0x6X UTF-16BE, with the length inline for
// short strings and in a trailing int object for longer ones.
function readPlistString(buf, i) {
  const marker = buf[i]
  const kind = marker & 0xf0
  if (kind !== 0x50 && kind !== 0x60) return null

  let count = marker & 0x0f
  let start = i + 1
  if (count === 0x0f) {
    if ((buf[start] & 0xf0) !== 0x10) return null
    const width = 1 << (buf[start] & 0x0f)
    count = Number(buf.readUIntBE(start + 1, width))
    start += 1 + width
  }

  const bytes = kind === 0x60 ? count * 2 : count
  if (!count || start + bytes > buf.length) return null
  const slice = buf.subarray(start, start + bytes)
  const text =
    kind === 0x60 ? Buffer.from(slice).swap16().toString('utf16le') : slice.toString('utf8')
  return { text, next: start + bytes }
}

export function pathsFromBinaryPlist(buf) {
  if (!buf?.length || buf.subarray(0, 6).toString('latin1') !== 'bplist') return []
  const out = []
  let i = 8 // past the "bplist00" header
  while (i < buf.length) {
    const found = readPlistString(buf, i)
    if (!found) {
      i += 1
      continue
    }
    if (found.text.startsWith('/')) out.push(found.text)
    i = found.next
  }
  return out
}

// The Apple URL flavour is an XML plist of file:// URLs (and only ever the
// first copied file), so it is a fallback, not the main source.
function plistUrls(xml) {
  const out = []
  for (const [, raw] of String(xml || '').matchAll(/<string>([\s\S]*?)<\/string>/g)) {
    const path = fileUrlToPath(raw.trim())
    if (path) out.push(path)
  }
  return out
}

/**
 * @param {{ formats: () => string[], readText: (f: string) => string,
 *           readBuffer: (f: string) => { toString: (enc: string) => string } }} clip
 * @returns {string[]} absolute paths, empty when the clipboard holds no files
 */
export function clipboardFilePaths(clip) {
  // Read by content, never by availableFormats(): macOS omits
  // NSFilenamesPboardType from that list while still serving it, and lists
  // text/uri-list while serving nothing for it. Each source is tried in turn
  // and the first that actually yields paths wins.
  const buffer = (f) => {
    try {
      return clip.readBuffer(f) ?? Buffer.alloc(0)
    } catch {
      return Buffer.alloc(0)
    }
  }
  const text = (f) => {
    try {
      return clip.readText(f) ?? ''
    } catch {
      return ''
    }
  }

  const sources = [
    () => pathsFromUriList(buffer('text/uri-list').toString('utf8')),
    () => pathsFromBinaryPlist(buffer('NSFilenamesPboardType')),
    () => pathsFromPlist(buffer('NSFilenamesPboardType').toString('utf8')),
    () => plistUrls(buffer('Apple URL pasteboard type').toString('utf8')),
    () => [fileUrlToPath(text('public.file-url'))].filter(Boolean),
    () => [buffer('FileNameW').toString('ucs2').replace(/\0+$/, '').trim()].filter(Boolean)
  ]
  for (const read of sources) {
    const paths = read()
    if (paths.length) return paths
  }
  return []
}
