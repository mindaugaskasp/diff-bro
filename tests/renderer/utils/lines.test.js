import { describe, expect, it } from 'vitest'
import { processLines, SORTS } from '../../../src/renderer/src/utils/lines'

// A complete opts object; each test overrides only what it exercises so the
// default is the identity transform (output === input, newline-joined).
const base = {
  trim: false,
  dropBlank: false,
  dedupe: false,
  sort: 'none',
  find: '',
  replace: '',
  prefix: '',
  suffix: '',
  separator: '\n'
}
const run = (text, over = {}) => processLines(text, { ...base, ...over })

describe('processLines', () => {
  it('is the identity transform with default options', () => {
    const { output, count } = run('a\nb\nc')
    expect(output).toBe('a\nb\nc')
    expect(count).toEqual({ in: 3, out: 3, dupes: 0 })
  })

  it('treats empty input as zero lines, not one blank line', () => {
    expect(run('')).toEqual({ output: '', count: { in: 0, out: 0, dupes: 0 } })
  })

  it('normalizes CRLF on the split', () => {
    expect(run('a\r\nb\r\nc').output).toBe('a\nb\nc')
  })

  it('trims each line without touching interior spaces', () => {
    expect(run('  a b  \n\tc\t', { trim: true }).output).toBe('a b\nc')
  })

  it('drops blank lines and counts them via in/out', () => {
    const { output, count } = run('a\n\nb\n\n', { dropBlank: true })
    expect(output).toBe('a\nb')
    expect(count).toEqual({ in: 5, out: 2, dupes: 0 })
  })

  it('trim then drop-blank removes whitespace-only lines', () => {
    expect(run('a\n   \nb', { trim: true, dropBlank: true }).output).toBe('a\nb')
  })

  it('dedupes keeping the first occurrence and reports the dupe count', () => {
    const { output, count } = run('b\na\nb\nc\na', { dedupe: true })
    expect(output).toBe('b\na\nc')
    expect(count).toEqual({ in: 5, out: 3, dupes: 2 })
  })

  it('sorts A→Z and Z→A', () => {
    expect(run('b\na\nc', { sort: 'asc' }).output).toBe('a\nb\nc')
    expect(run('b\na\nc', { sort: 'desc' }).output).toBe('c\nb\na')
  })

  it('natural sort orders numbers by value, not lexically', () => {
    expect(run('item10\nitem2\nitem1', { sort: 'natural' }).output).toBe('item1\nitem2\nitem10')
    expect(run('item10\nitem2\nitem1', { sort: 'asc' }).output).toBe('item1\nitem10\nitem2')
  })

  it('find/replace is literal, never regex', () => {
    expect(run('a.b\nc.d', { find: '.', replace: '_' }).output).toBe('a_b\nc_d')
    expect(run('$1 off\n$1 more', { find: '$1', replace: 'X' }).output).toBe('X off\nX more')
  })

  it('wraps each line with a prefix and suffix', () => {
    expect(run('a\nb', { prefix: '"', suffix: '"' }).output).toBe('"a"\n"b"')
  })

  it('joins with an arbitrary separator', () => {
    expect(run('a\nb\nc', { separator: ', ' }).output).toBe('a, b, c')
  })

  it('builds a SQL IN-clause list from a messy UUID paste (the headline use case)', () => {
    const paste = '  1a2b  \n3c4d\n\n1a2b\n5e6f  '
    const { output, count } = run(paste, {
      trim: true,
      dropBlank: true,
      dedupe: true,
      prefix: '"',
      suffix: '"',
      separator: ',\n'
    })
    expect(output).toBe('"1a2b",\n"3c4d",\n"5e6f"')
    expect(count).toEqual({ in: 5, out: 3, dupes: 1 })
  })

  it('applies steps in order: trim → replace → dropBlank → dedupe → sort → wrap → join', () => {
    const { output } = run(' b \na\n b \n', {
      trim: true,
      find: 'a',
      replace: 'z',
      dropBlank: true,
      dedupe: true,
      sort: 'asc',
      prefix: '[',
      suffix: ']',
      separator: '|'
    })
    expect(output).toBe('[b]|[z]')
  })

  it('exposes the supported sort keys', () => {
    expect(SORTS).toEqual(['none', 'asc', 'desc', 'natural'])
  })
})
