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

/**
 * @param {{ formats: () => string[], readText: (f: string) => string,
 *           readBuffer: (f: string) => { toString: (enc: string) => string } }} clip
 * @returns {string[]} absolute paths, empty when the clipboard holds no files
 */
export function clipboardFilePaths(clip) {
  const formats = clip.formats() ?? []
  const has = (f) => formats.includes(f)

  if (has('text/uri-list'))
    return pathsFromUriList(clip.readBuffer('text/uri-list').toString('utf8'))
  if (has('NSFilenamesPboardType')) {
    return pathsFromPlist(clip.readBuffer('NSFilenamesPboardType').toString('utf8'))
  }
  // Single-file fallbacks: macOS hands one file URL, Windows one UTF-16 path.
  if (has('public.file-url')) {
    const path = fileUrlToPath(clip.readText('public.file-url'))
    return path ? [path] : []
  }
  if (has('FileNameW')) {
    const path = clip.readBuffer('FileNameW').toString('ucs2').replace(/\0+$/, '').trim()
    return path ? [path] : []
  }
  return []
}
