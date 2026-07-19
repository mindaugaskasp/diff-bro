// Best-effort language guess for the Snippets editor's syntax highlighting.
// Wrong guesses only cost coloring quality, not correctness, so this is a
// deliberately cheap heuristic rather than a real parser for every format.
import { validateJson } from './textFormats'

// Syntaxes offered in the snippet editor's language picker. `id` is the
// Monaco language id (all bundled with monaco-editor); 'auto' means "let
// detectSnippetLanguage pick as you type".
export const SNIPPET_LANGUAGES = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'plaintext', label: 'Plain text' },
  { id: 'json', label: 'JSON' },
  { id: 'sql', label: 'SQL' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'yaml', label: 'YAML / Kubernetes' },
  { id: 'python', label: 'Python' },
  { id: 'shell', label: 'Bash / Shell' },
  { id: 'php', label: 'PHP' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'xml', label: 'XML' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'java', label: 'Java' }
]

const SQL_START =
  /^(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW|DATABASE)|ALTER\s+TABLE|DROP\s+(TABLE|INDEX|VIEW|DATABASE)|WITH\s+\w+\s+AS)\b/i

// Strong signals are distinctive enough alone; weak ones (a bullet list, a
// blockquote) are common in plain text too, so two are required together.
const MARKDOWN_STRONG = [/^#{1,6}\s+\S/m, /```/, /\[[^\]]+\]\([^)]+\)/]
const MARKDOWN_WEAK = [/^[-*+]\s+\S/m, /^\d+\.\s+\S/m, /^>\s+\S/m]

export function detectSnippetLanguage(content) {
  const trimmed = content.trim()
  if (!trimmed) return 'plaintext'

  if ((trimmed[0] === '{' || trimmed[0] === '[') && validateJson(trimmed).valid) return 'json'

  if (SQL_START.test(trimmed)) return 'sql'

  const strongHit = MARKDOWN_STRONG.some((re) => re.test(trimmed))
  const weakHits = MARKDOWN_WEAK.filter((re) => re.test(trimmed)).length
  if (strongHit || weakHits >= 2) return 'markdown'

  return 'plaintext'
}
