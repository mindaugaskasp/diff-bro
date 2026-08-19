// Inverse of markdownRender's parseMarkdown.
//
// Normalising: the tree records structure, not which spelling produced it, so
// `* item` returns as `- item`. serializeRoundTrip.test.js asserts that table.

const INLINE = {
  text: (n) => n.value ?? '',
  strong: (n) => `**${inlines(n.inlines)}**`,
  em: (n) => `*${inlines(n.inlines)}*`,
  del: (n) => `~~${inlines(n.inlines)}~~`,
  // Markdown has no underline, and <u> is markup parseMarkdown cannot read back.
  ins: (n) => inlines(n.inlines),
  code: (n) => `\`${n.value ?? ''}\``,
  link: (n) => `[${n.label ?? ''}](${n.href ?? ''})`
}

const inlines = (nodes) => (nodes ?? []).map((n) => INLINE[n.type]?.(n) ?? '').join('')

const ALIGN = { left: ':---', center: ':---:', right: '---:' }

const LEVEL = '  '

function listLines(block) {
  const counters = []
  return (block.items ?? []).map((item) => {
    const depth = Math.max(1, item.depth ?? 1)
    counters.length = depth
    counters[depth - 1] = (counters[depth - 1] ?? 0) + 1
    const marker = block.ordered ? `${counters[depth - 1]}.` : '-'
    const box = item.task ? `[${item.checked ? 'x' : ' '}] ` : ''
    return `${LEVEL.repeat(depth - 1)}${marker} ${box}${inlines(item.inlines)}`
  })
}

function tableLines(block) {
  const row = (cells) => `| ${(cells ?? []).map(inlines).join(' | ')} |`
  const width = block.head?.length || block.rows?.[0]?.length || 0
  const rule = Array.from({ length: width }, (_, i) => ALIGN[block.align?.[i]] ?? '---')
  const head = block.head?.length ? [row(block.head)] : []
  return [...head, `| ${rule.join(' | ')} |`, ...(block.rows ?? []).map(row)]
}

const quoted = (block) =>
  serializeMarkdown(block.children)
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))

const BLOCK = {
  heading: (b) => [`${'#'.repeat(Math.min(6, Math.max(1, b.level ?? 1)))} ${inlines(b.inlines)}`],
  paragraph: (b) => (b.lines ?? []).map(inlines),
  list: listLines,
  table: tableLines,
  quote: quoted,
  code: (b) => ['```', ...String(b.code ?? '').split('\n'), '```']
}

/**
 * @param {import('../types').JiraBlock[]} blocks
 * @returns {string}
 */
export function serializeMarkdown(blocks) {
  return (blocks ?? [])
    .map((b) => (BLOCK[b?.type] ?? BLOCK.paragraph)(b ?? {}).join('\n'))
    .join('\n\n')
}
