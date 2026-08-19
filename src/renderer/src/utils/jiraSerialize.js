// Inverse of jiraRender's parseJira. Same tree as markdownSerialize, different
// markers: depth is marker REPETITION, a quote is a fence, tables have no
// alignment row.

const INLINE = {
  text: (n) => n.value ?? '',
  strong: (n) => `*${inlines(n.inlines)}*`,
  em: (n) => `_${inlines(n.inlines)}_`,
  ins: (n) => `+${inlines(n.inlines)}+`,
  del: (n) => `-${inlines(n.inlines)}-`,
  code: (n) => `{{${n.value ?? ''}}}`,
  link: (n) => (n.label === n.href ? `[${n.href ?? ''}]` : `[${n.label ?? ''}|${n.href ?? ''}]`)
}

const inlines = (nodes) => (nodes ?? []).map((n) => INLINE[n.type]?.(n) ?? '').join('')

// jiraRender reads depth off the marker's LENGTH. Jira has no task syntax, so a
// task item loses its box.
const listLines = (block) =>
  (block.items ?? []).map(
    (item) =>
      `${(block.ordered ? '#' : '*').repeat(Math.max(1, item.depth ?? 1))} ${inlines(item.inlines)}`
  )

function tableLines(block) {
  const row = (cells, sep) => `${sep} ${(cells ?? []).map(inlines).join(` ${sep} `)} ${sep}`
  const head = block.head?.length ? [row(block.head, '||')] : []
  return [...head, ...(block.rows ?? []).map((r) => row(r, '|'))]
}

const BLOCK = {
  heading: (b) => [`h${Math.min(6, Math.max(1, b.level ?? 1))}. ${inlines(b.inlines)}`],
  paragraph: (b) => (b.lines ?? []).map(inlines),
  list: listLines,
  table: tableLines,
  // `bq.` takes one line; the tree can hold a heading and three paragraphs.
  quote: (b) => ['{quote}', serializeJira(b.children), '{quote}'],
  code: (b) => ['{code}', String(b.code ?? ''), '{code}']
}

/**
 * @param {import('../types').JiraBlock[]} blocks
 * @returns {string}
 */
export function serializeJira(blocks) {
  return (blocks ?? [])
    .map((b) => (BLOCK[b?.type] ?? BLOCK.paragraph)(b ?? {}).join('\n'))
    .join('\n\n')
}
