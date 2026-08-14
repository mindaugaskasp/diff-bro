// Cheap best-effort language guess for snippet highlighting: each signal fires
// only on something distinctive (a false positive mis-colors a whole snippet, a
// miss only lands on plaintext), ordered most-distinctive-first, and bounded —
// the content can come from a snippet somebody else sealed.
import { validateJson } from './textFormats'
import { isClaudeLink } from './claudeLink'
import { looksLikeMermaid } from './mermaid'

// The picker's options live in src/shared so the CLI prompt offers the same set.
export { SNIPPET_LANGUAGES } from '../../../shared/snippetLanguages'

const firstLine = (t) => {
  const nl = t.indexOf('\n')
  return nl === -1 ? t : t.slice(0, nl)
}

// A shebang names its interpreter — the highest-confidence signal, checked first.
function detectShebang(t) {
  const first = firstLine(t)
  if (!first.startsWith('#!')) return null
  if (/\bpython[\d.]*\b/.test(first)) return 'python'
  if (/\bphp\b/.test(first)) return 'php'
  if (/\bnode\b/.test(first)) return 'javascript'
  // bash / sh / zsh / an unknown interpreter — still a shell script.
  return 'shell'
}

const DETECT_LIMIT = 50_000
const PHP_RE = /<\?(php\b|=)/i

// PHP without an open tag. Split in two because a `$` sigil alone is NOT
// distinctive — it is a shell expansion, an f-string field and a jQuery
// identifier too — so the weak half runs last, behind markdown.
const PHP_STRONG = [
  // UNSPACED, on a line that ENDS like a statement: ` -> ` with room around it
  // claimed shell strings, f-strings, Go comments and markdown prose.
  /\$[A-Za-z_]\w*->\s*\w[^\n]*[;{,)]\s*$/m,
  // Column 0 — an indented copy is a markdown code block quoting PHP.
  /^namespace\s+[\w\\]+\s*;/m,
  /^use\s+\w+\\[\w\\]*(\s+as\s+\w+)?\s*;/m,
  // ONE split of each whitespace run can match: `\s+` beside a nullable group
  // beside `\s*` is quadratic, and 64k spaces took two seconds. Declaration
  // only — `private $q = makeQ()` is equally TypeScript.
  /\b(public|private|protected)(\s+(static|readonly))*\s+(function\b|[\w|?\\]*\$[A-Za-z_]\w*\s*;)/,
  // A whole statement: `require_once` in backticks is a changelog ABOUT PHP.
  /^[ \t]*(require|include)_once\b[^\n]*;/m,
  // PHP's array syntax; the same line is a syntax error in JS.
  /^[ \t]*(['"]).*?\1\s*=>/m
]
// jQuery wrote `$x = …;` for years, so it needs a SECOND at column 0 — and `.`
// concatenates in PHP, so a dotted call on a sigil variable rules it out.
const PHP_ASSIGN = /^\$[A-Za-z_]\w*\s*(\[[^\]]*\]\s*)?\??=[^=][^\n]*;[ \t]*$/gm
const JS_SIGIL_MEMBER = /\$[A-Za-z_]\w*\.[A-Za-z_]\w*\s*[(.]/
const looksLikePhp = (t) => PHP_STRONG.some((re) => re.test(t))
const maybePhp = (t) => (t.match(PHP_ASSIGN) ?? []).length >= 2 && !JS_SIGIL_MEMBER.test(t)

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
    // `$` is a legal identifier start, and a `$name` here is annotated, not a
    // PHP sigil — PHP's own form (`private string $x;`) has no colon.
    /\b(readonly|public|private|protected)\s+[\w$]+\s*[:?]/.test(t)
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
// The two that scan anywhere skip JSON-shaped text, which isJson misses once a
// file is too big to parse inside the window — else its quoted markup names it.
const DETECTORS = [
  detectShebang,
  (t) => (!jsonShaped(t) && PHP_RE.test(t) ? 'php' : null),
  (t) => (XML_DECL_RE.test(t) ? 'xml' : null),
  (t) => (!jsonShaped(t) && HTML_RE.test(t) ? 'html' : null),
  (t) => (looksLikeXml(t) ? 'xml' : null),
  (t) => (looksLikeDockerfile(t) ? 'dockerfile' : null),
  (t) => (looksLikeCss(t) ? 'css' : null),
  (t) => (SQL_START.test(t) ? 'sql' : null),
  (t) => (looksLikeGo(t) ? 'go' : null),
  (t) => (looksLikeRust(t) ? 'rust' : null),
  // Java first: a field named `$amount` reads as a PHP property.
  (t) => (looksLikeJava(t) ? 'java' : null),
  (t) => (looksLikePhp(t) ? 'php' : null),
  (t) => (looksLikeTypeScript(t) ? 'typescript' : null),
  (t) => (looksLikePython(t) ? 'python' : null),
  (t) => (looksLikeJavaScript(t) ? 'javascript' : null),
  (t) => (looksLikeYaml(t) ? 'yaml' : null),
  (t) => (looksLikeShell(t) ? 'shell' : null)
]

// Checked before the code detectors so code inside a fence can't win.
const MARKDOWN_FENCE = /^```/m
// After the code detectors, so a lone `#` can't pre-empt a real program.
const MARKDOWN_STRONG = [/^#{1,6}\s+\S/m, /\[[^\]]+\]\([^)]+\)/]
const MARKDOWN_WEAK = [/^[-*+]\s+\S/m, /^\d+\.\s+\S/m, /^>\s+\S/m]
const jsonShaped = (t) => t[0] === '{' || t[0] === '['
const isJson = (t) => jsonShaped(t) && validateJson(t).valid

// A heading or link alone is enough; the weaker list/quote signals (also common
// in plain prose) must appear at least twice together.
function isMarkdownProse(t) {
  const strongHit = MARKDOWN_STRONG.some((re) => re.test(t))
  const weakHits = MARKDOWN_WEAK.filter((re) => re.test(t)).length
  return strongHit || weakHits >= 2
}

// The weak PHP rule sits behind markdown: a `$name = …;` in an indented code
// block is a note ABOUT PHP, and relabelled the whole document.
function fallbackFor(t) {
  if (isMarkdownProse(t)) return 'markdown'
  return maybePhp(t) ? 'php' : 'plaintext'
}

export function detectSnippetLanguage(content) {
  // Bounded because restoreBundle feeds an imported .diffbro straight through
  // add(), and a snippet may be 8 MB.
  const t = String(content ?? '')
    .slice(0, DETECT_LIMIT)
    .trim()
  if (!t) return 'plaintext'
  if (isClaudeLink(t)) return 'claude'
  if (isJson(t)) return 'json'

  // Before markdown, so a fenced diagram isn't claimed by its ``` fence.
  if (looksLikeMermaid(t)) return 'mermaid'
  if (MARKDOWN_FENCE.test(t)) return 'markdown'

  for (const detect of DETECTORS) {
    const lang = detect(t)
    if (lang) return lang
  }

  return fallbackFor(t)
}
