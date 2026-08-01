// Scrubs on the way IN, not on read: the log dir is user-chosen and can be a
// synced folder, so nothing sensitive may reach the file in the first place.
import { DOC_EXTENSIONS } from './fileFilters'

// Longest first so `.diffbrokey` is not matched as `.diffbro`.
const DOC_EXT = [...DOC_EXTENSIONS, 'diffbrokey', 'diffbro', 'txt', 'text']
  .sort((a, b) => b.length - a.length)
  .join('|')

const SEP = String.raw`[\\/]`
const ROOT = String.raw`(?:~|[A-Za-z]:)?${SEP}`
// A space is only part of the segment when more path follows, so the sentence
// before a path is not swallowed.
const SEG = String.raw`(?:[^\s\\/"'<>|*?:;,()[\]{}]|[ ](?=\S))+`

const ROOTED_DOC_PATH = new RegExp(`${ROOT}(?:${SEG}${SEP})*${SEG}\\.(?:${DOC_EXT})\\b`, 'gi')
const BARE_DOC_FILE = new RegExp(String.raw`(?<![\w\\/.~-])[\w.-]+\.(?:${DOC_EXT})\b`, 'gi')

function collapseDocPath(full) {
  const cut = Math.max(full.lastIndexOf('/'), full.lastIndexOf('\\'))
  const base = full.slice(cut + 1)
  const ext = base.slice(base.lastIndexOf('.') + 1)
  if (cut === -1) return `<file>.${ext}`
  const dir = full.slice(0, cut)
  const sep = full[cut]
  if (!dir) return `${sep}<file>.${ext}`
  const root = dir.startsWith('~') ? '~' : /^[A-Za-z]:/.test(dir) ? dir.slice(0, 2) : ''
  return `${root}${sep}…${sep}<file>.${ext}`
}

// Order matters: paths collapse before the account rules, so a document under
// another user's home loses the whole path rather than just the account name.
const RULES = [
  [/\b(https?):\/\/([^\s/"'<>]+)[^\s"'<>]*/gi, '$1://$2/<path>'],
  [ROOTED_DOC_PATH, collapseDocPath],
  [BARE_DOC_FILE, collapseDocPath],
  [/(\/(?:Users|home)\/)[^/\\\s]+/g, '$1<user>'],
  [/([A-Za-z]:\\Users\\)[^\\/\s]+/gi, '$1<user>'],
  [/\\\\[^\\/\s]+\\[^\\/\s]+/g, '\\\\<host>\\<share>'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>'],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>'],
  [/\b[0-9a-f]{32,}\b/gi, (m) => `<hex:${m.length}>`],
  [
    /(?<![\w+=-])(?=[A-Za-z0-9+_=-]*\d)(?=[A-Za-z0-9+_=-]*[A-Z])[A-Za-z0-9+_=-]{40,}(?![\w+=-])/g,
    (m) => `<b64:${m.length}>`
  ]
]

export function redactHome(text, homeDir) {
  if (!homeDir) return text
  const escaped = homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(text).replace(new RegExp(escaped, 'g'), '~')
}

/**
 * @param {unknown} text
 * @param {{homeDir?: string}} [options]
 * @returns {string} the text with paths, accounts and secret-shaped runs replaced
 */
export function redactSensitive(text, { homeDir } = {}) {
  let out = redactHome(String(text ?? ''), homeDir)
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement)
  return out
}
