// "Copy as file" — the twin of copying content. Copy content puts characters on
// the clipboard; this puts a FILE there, so the destination that wants one (a
// mail draft, a chat window, a folder) gets one.
//
// Pure naming + guard logic, so the two stores that expose the command stay thin
// and neither grows past its cap. The IPC call takes bytes and a display name;
// main stages the file (src/main/clipboardStage.js) and the renderer never sees
// or supplies a path.
import { toUnifiedDiff } from './unifiedDiff'
import { isSecret } from './secretSnippet'

const MAX_STEM = 60

// A filename that reads like the thing it came from, and cannot be a path.
const stem = (raw, fallback) => {
  const slug = String(raw ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, MAX_STEM)
  return slug || fallback
}

/**
 * The patch for the current comparison, or the reason there isn't one. Mirrors
 * the guards copyDiff already applies, so the pair cannot drift.
 * @param {object} diff the diff store
 * @returns {{ name: string, content: string } | { error: string }}
 */
export function diffPatchFile(diff) {
  if (!diff.ready) return { error: 'Load two files (or compare pasted text) before copying.' }
  if (diff.isStreamed) return { error: 'streamed' }
  if (diff.comparableKind !== 'text') {
    return { error: 'Copy as file is only available for text comparisons.' }
  }
  const res = toUnifiedDiff(diff.leftComparable.text, diff.rightComparable.text, {
    leftLabel: diff.left.name,
    rightLabel: diff.right.name
  })
  if (res.error === 'too-large') return { error: 'This diff is too large to copy.' }
  if (!res.patch) return { error: 'The two sides are identical — nothing to copy.' }
  return { name: `${stem(diff.left.name, 'diff')}.patch`, content: res.patch }
}

/**
 * A snippet as a file, named from its title with its language's extension.
 *
 * A secret snippet is REFUSED: its guarantee is that the contents never land
 * somewhere readable, and a staged file is plaintext on disk for as long as the
 * copy lives. Copy content still works — a text clipboard is volatile.
 * @param {{ name?: string, content?: string, secret?: boolean, lang?: string }} snippet
 * @returns {{ name: string, content: string } | { error: string }}
 */
export function snippetFile(snippet) {
  if (!snippet) return { error: 'Nothing to copy.' }
  if (isSecret(snippet)) {
    return { error: "Secret snippets can't be copied as a file — use Copy content." }
  }
  if (!snippet.content) return { error: 'That snippet is empty — nothing to copy.' }
  const ext = LANG_EXT[snippet.lang] ?? (snippet.lang || 'txt')
  return { name: `${stem(snippet.name, 'snippet')}.${ext}`, content: snippet.content }
}

// Only where the language id and the extension disagree; everything else uses
// the id itself, so a new language needs no entry here.
const LANG_EXT = {
  markdown: 'md',
  yaml: 'yml',
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  shell: 'sh',
  plaintext: 'txt',
  mermaid: 'mmd'
}
