// Best-effort language guess for the Snippets editor's syntax highlighting.
// Wrong guesses only cost coloring quality, not correctness, so this is a
// deliberately cheap heuristic rather than a real parser for every format.
//
// The guiding rule for every signal below: fire only on something distinctive
// and low-ambiguity, and stay silent otherwise — a miss lands on plaintext,
// which is neutral, whereas a false positive mis-colors a whole snippet. The
// detectors are ordered most-distinctive-first; the first hit wins.
import { validateJson } from './textFormats'
import { looksLikeMermaid } from './mermaid'

// Syntaxes offered in the snippet editor's language picker. `id` is the
// Monaco language id (all bundled with monaco-editor); 'auto' means "let
// detectSnippetLanguage pick as you type".
export const SNIPPET_LANGUAGES = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'plaintext', label: 'Plain text' },
  { id: 'mermaid', label: 'Mermaid diagram' },
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

const firstLine = (t) => {
  const nl = t.indexOf('\n')
  return nl === -1 ? t : t.slice(0, nl)
}

// A shebang names its interpreter outright — the single highest-confidence
// signal we have, so it is checked first.
function detectShebang(t) {
  const first = firstLine(t)
  if (!first.startsWith('#!')) return null
  if (/\bpython[\d.]*\b/.test(first)) return 'python'
  if (/\bphp\b/.test(first)) return 'php'
  if (/\bnode\b/.test(first)) return 'javascript'
  // bash / sh / zsh / an unknown interpreter — still a shell script.
  return 'shell'
}

const PHP_RE = /<\?(php\b|=)/i
const XML_DECL_RE = /^<\?xml\b/i
// HTML-only tags (a generic <tag> is left to the XML detector below).
const HTML_RE =
  /<!doctype\s+html|<html[\s>]|<(head|body|div|span|script|style|link|meta|title|section|article|nav|header|footer|main|button|form|input)\b/i

function looksLikeXml(t) {
  if (t[0] !== '<') return false
  // A matching tag pair or a self-closing tag — i.e. real markup, not a lone `<`.
  return /<([\w:-]+)(\s[^<>]*)?>[\s\S]*<\/\1\s*>/.test(t) || /<[\w:-]+[^<>]*\/>/.test(t)
}

const DOCKER_INSTRUCTION =
  /^(RUN|CMD|COPY|ADD|ENV|WORKDIR|ENTRYPOINT|EXPOSE|ARG|LABEL|USER|VOLUME|HEALTHCHECK|SHELL|STOPSIGNAL|ONBUILD|MAINTAINER)\b/im
function looksLikeDockerfile(t) {
  const firstReal = t
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
  return !!firstReal && /^FROM\s+\S+/i.test(firstReal) && DOCKER_INSTRUCTION.test(t)
}

// Code keywords that mean "this brace block is a program, not a CSS rule".
const NOT_CSS =
  /\b(function|const|let|var|interface|class|enum|import|export|return|def|func|fn|public|private|protected)\b|=>/
const CSS_AT_RULE = /@(media|import|font-face|keyframes|supports|charset|namespace)\b/i
const CSS_RULE = /(^|[};])\s*[*.#:@]?[\w-][^\n{}]*\{[^{}]*[\w-]+\s*:\s*[^{}]+;?\s*\}/m
function looksLikeCss(t) {
  if (NOT_CSS.test(t)) return false
  return CSS_AT_RULE.test(t) || CSS_RULE.test(t)
}

const SQL_START =
  /^(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW|DATABASE)|ALTER\s+TABLE|DROP\s+(TABLE|INDEX|VIEW|DATABASE)|WITH\s+\w+\s+AS)\b/i

function looksLikeGo(t) {
  if (/^package\s+\w+/m.test(t)) return true
  return (
    /\bfunc\s+(\(\s*\w+\s+[\w*.]+\s*\)\s*)?\w+\s*\(/.test(t) &&
    (/:=/.test(t) || /\bimport\s+\(/.test(t) || /\bfmt\.\w+/.test(t))
  )
}

// `fn name(` is distinctive to Rust among the offered languages.
const RUST_RE = /\bfn\s+\w+\s*(<[^>]*>)?\s*\(/
function looksLikeRust(t) {
  return (
    RUST_RE.test(t) ||
    /\blet\s+mut\s+\w+/.test(t) ||
    /\b(println!|panic!|vec!|format!)/.test(t) ||
    /\buse\s+\w+::/.test(t)
  )
}

const JAVA_DECL =
  /\b(public|private|protected)\s+(static\s+|final\s+|abstract\s+)*(class|interface|enum)\s+\w+/
function looksLikeJava(t) {
  return (
    JAVA_DECL.test(t) ||
    /\bimport\s+java\./.test(t) ||
    /\bSystem\.out\.print/.test(t) ||
    /\bpublic\s+static\s+void\s+main\s*\(/.test(t)
  )
}

function looksLikeTypeScript(t) {
  return (
    /\binterface\s+\w+\s*(<[^>]*>)?\s*\{/.test(t) ||
    /\btype\s+\w+\s*=/.test(t) ||
    /\benum\s+\w+\s*\{/.test(t) ||
    /\bimport\s+type\b/.test(t) ||
    // A type annotation followed by code punctuation — not prose like "count: number of files".
    /:\s*(string|number|boolean|any|unknown|never|void)\s*[;,)\]}=|&>]/.test(t) ||
    /\bas\s+(const|string|number|boolean|\w+(\[\]|<[^>]*>))/.test(t) ||
    /\b(readonly|public|private|protected)\s+\w+\s*[:?]/.test(t)
  )
}

function looksLikePython(t) {
  if (/^\s*(async\s+)?def\s+\w+\s*\([^)]*\)\s*(->[^:\n]+)?:/m.test(t)) return true
  if (/^\s*class\s+\w+\s*(\([^)]*\))?\s*:/m.test(t)) return true
  if (/\bif\s+__name__\s*==\s*['"]__main__['"]\s*:/.test(t)) return true
  const imports = /^\s*from\s+[\w.]+\s+import\b/m.test(t) || /^\s*import\s+\w+/m.test(t)
  return imports && /^\s*(print\s*\(|def\s|class\s|@\w+|\w+\s*=)/m.test(t)
}

function looksLikeJavaScript(t) {
  return (
    /\b(const|let|var)\s+[\w{[]/.test(t) ||
    /=>/.test(t) ||
    /\bfunction\s*\*?\s*\w*\s*\(/.test(t) ||
    /\bconsole\.(log|error|warn|info)\s*\(/.test(t) ||
    /\brequire\s*\(\s*['"]/.test(t) ||
    /\bmodule\.exports\b/.test(t) ||
    /\bexport\s+(default|const|function|class|\{)/.test(t) ||
    /\bimport\b[^\n]*\bfrom\s+['"]/.test(t)
  )
}

const YAML_KEY = /^[ \t]*[\w.-]+:(\s|$)/
function looksLikeYaml(t) {
  if (/^---\s*$/m.test(t)) return true
  if (/^\s*(apiVersion|kind|metadata|spec|containers|replicas|selector):/m.test(t)) return true
  if (/[{};]/.test(t)) return false // braces/semicolons ⇒ JSON/CSS/code, not YAML
  return t.split('\n').filter((l) => YAML_KEY.test(l)).length >= 2
}

function looksLikeShell(t) {
  return (
    (/^\s*(if|elif)\b[^\n]*;\s*then\b/m.test(t) && /^\s*fi\b/m.test(t)) ||
    (/^\s*for\b[^\n]*;\s*do\b/m.test(t) && /^\s*done\b/m.test(t)) ||
    /^\s*case\s+.+\s+in\b/m.test(t) ||
    /^\s*export\s+\w+=/m.test(t) ||
    (/\becho\s+["'$]/.test(t) && /\$\{?\w/.test(t))
  )
}

// Ordered most-distinctive-first; the first detector to claim the text wins.
const DETECTORS = [
  detectShebang,
  (t) => (PHP_RE.test(t) ? 'php' : null),
  (t) => (XML_DECL_RE.test(t) ? 'xml' : null),
  (t) => (HTML_RE.test(t) ? 'html' : null),
  (t) => (looksLikeXml(t) ? 'xml' : null),
  (t) => (looksLikeDockerfile(t) ? 'dockerfile' : null),
  (t) => (looksLikeCss(t) ? 'css' : null),
  (t) => (SQL_START.test(t) ? 'sql' : null),
  (t) => (looksLikeGo(t) ? 'go' : null),
  (t) => (looksLikeRust(t) ? 'rust' : null),
  (t) => (looksLikeJava(t) ? 'java' : null),
  (t) => (looksLikeTypeScript(t) ? 'typescript' : null),
  (t) => (looksLikePython(t) ? 'python' : null),
  (t) => (looksLikeJavaScript(t) ? 'javascript' : null),
  (t) => (looksLikeYaml(t) ? 'yaml' : null),
  (t) => (looksLikeShell(t) ? 'shell' : null)
]

// A fenced code block means the document is Markdown wrapping code — checked
// before the code detectors so the code *inside* the fence can't win.
const MARKDOWN_FENCE = /^```/m
// The remaining Markdown signals live after the code detectors, so a lone `#`
// (also a comment marker in several languages) can't pre-empt a real program.
const MARKDOWN_STRONG = [/^#{1,6}\s+\S/m, /\[[^\]]+\]\([^)]+\)/]
const MARKDOWN_WEAK = [/^[-*+]\s+\S/m, /^\d+\.\s+\S/m, /^>\s+\S/m]

const isJson = (t) => (t[0] === '{' || t[0] === '[') && validateJson(t).valid

// A heading or link alone is enough; the weaker list/quote signals (also common
// in plain prose) must appear at least twice together.
function isMarkdownProse(t) {
  const strongHit = MARKDOWN_STRONG.some((re) => re.test(t))
  const weakHits = MARKDOWN_WEAK.filter((re) => re.test(t)).length
  return strongHit || weakHits >= 2
}

export function detectSnippetLanguage(content) {
  const t = content.trim()
  if (!t) return 'plaintext'
  if (isJson(t)) return 'json'

  // Distinctive diagram keywords ('flowchart', 'sequenceDiagram', …) — checked
  // before markdown, whose ``` fences could otherwise claim a fenced diagram.
  if (looksLikeMermaid(t)) return 'mermaid'
  if (MARKDOWN_FENCE.test(t)) return 'markdown'

  for (const detect of DETECTORS) {
    const lang = detect(t)
    if (lang) return lang
  }

  if (isMarkdownProse(t)) return 'markdown'
  return 'plaintext'
}
