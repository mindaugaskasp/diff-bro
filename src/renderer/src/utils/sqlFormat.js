// Dependency-free SQL formatter + heuristic validator (a keyword reflow, not a
// parser). Strings/quoted identifiers are masked first so their contents aren't
// touched.

// Clauses that start a fresh line at the base indent.
const CLAUSE = [
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION ALL',
  'UNION',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  'RETURNING'
]
// Join/boolean keywords that start a fresh, indented line.
const INDENTED = [
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'FULL OUTER JOIN',
  'OUTER JOIN',
  'CROSS JOIN',
  'JOIN',
  'ON',
  'AND',
  'OR'
]
// Bare keywords to upper-case wherever they appear.
const KEYWORDS = [
  ...CLAUSE,
  ...INDENTED,
  'AS',
  'IN',
  'IS',
  'NOT',
  'NULL',
  'LIKE',
  'BETWEEN',
  'EXISTS',
  'DISTINCT',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'ASC',
  'DESC',
  'WITH'
]

const STATEMENT_START =
  /^(WITH|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|MERGE|EXPLAIN|BEGIN|COMMIT|ROLLBACK)\b/i

// A Private-Use-Area code point wraps each placeholder so it can't collide with
// real tokens.
const SENTINEL = String.fromCharCode(0xe000)
const PLACEHOLDER = new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g')

// Mask string literals + quoted identifiers so formatting never rewrites them.
function mask(sql) {
  const literals = []
  const masked = sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, (m) => {
    literals.push(m)
    return `${SENTINEL}${literals.length - 1}${SENTINEL}`
  })
  return { masked, literals }
}
const unmask = (text, literals) => text.replace(PLACEHOLDER, (_, i) => literals[Number(i)])

const reword = (list) => list.map((k) => k.replace(/ /g, '\\s+')).join('|')

export function formatSql(sql) {
  const { masked, literals } = mask(sql)

  // Collapse whitespace, then break before clauses/joins.
  let out = masked.replace(/\s+/g, ' ').trim()
  out = out.replace(new RegExp(`\\s*\\b(${reword(CLAUSE)})\\b`, 'gi'), '\n$1')
  out = out.replace(new RegExp(`\\s*\\b(${reword(INDENTED)})\\b`, 'gi'), '\n  $1')
  // Upper-case every recognized keyword.
  out = out.replace(new RegExp(`\\b(${reword(KEYWORDS)})\\b`, 'gi'), (m) =>
    m.replace(/\s+/g, ' ').toUpperCase()
  )
  // Tidy spacing around commas and the trailing statement semicolon.
  out = out.replace(/ *, */g, ', ').replace(/\s*;\s*$/, ';')

  return unmask(out, literals)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim()))
    .join('\n')
    .trim()
}

export function validateSql(sql) {
  const trimmed = sql.trim()
  if (!trimmed) return { valid: false, error: 'Empty statement' }
  if (!STATEMENT_START.test(trimmed)) {
    return { valid: false, error: 'Does not start with a SQL statement keyword' }
  }

  const { masked } = mask(trimmed)
  // Unbalanced string/identifier quotes leave a stray quote behind after masking.
  if (/['"]/.test(masked)) return { valid: false, error: 'Unbalanced quote' }

  let depth = 0
  for (const ch of masked) {
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth < 0) return { valid: false, error: 'Unbalanced parentheses' }
    }
  }
  if (depth !== 0) return { valid: false, error: 'Unbalanced parentheses' }

  return { valid: true }
}
