import { describe, expect, it } from 'vitest'
import { delimitedKind, parseDelimited, sniffDelimiter } from '../../../src/renderer/src/utils/csv'

const rows = (text, delimiter) => parseDelimited(text, { delimiter }).rows

describe('parseDelimited', () => {
  it('splits plain rows and coerces unquoted numbers', () => {
    expect(rows('a,b,c\n1,2.5,-3')).toEqual([
      ['a', 'b', 'c'],
      [1, 2.5, -3]
    ])
  })

  it('leaves quoted and zero-padded fields as text', () => {
    expect(rows('"007",007,0,0.5')).toEqual([['007', '007', 0, 0.5]])
  })

  it('honours quoted delimiters, newlines and escaped quotes', () => {
    expect(rows('"a,b","line\nbreak","say ""hi"""')).toEqual([['a,b', 'line\nbreak', 'say "hi"']])
  })

  it('handles CRLF and a trailing newline without inventing a row', () => {
    expect(rows('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
  })

  it('keeps empty fields and empty rows in place', () => {
    expect(rows('a,,c\n,,')).toEqual([
      ['a', '', 'c'],
      ['', '', '']
    ])
  })

  it('strips a UTF-8 BOM so the first header is not mangled', () => {
    expect(rows('﻿id,name')).toEqual([['id', 'name']])
  })

  it('parses tabs when told to', () => {
    expect(rows('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      [1, 2]
    ])
  })

  it('stops at the row cap and says so', () => {
    const text = Array.from({ length: 10 }, (_, i) => `${i},x`).join('\n')
    const out = parseDelimited(text, { maxRows: 4 })
    expect(out.rows).toHaveLength(4)
    expect(out.truncated).toBe(true)
  })

  it('closes an unterminated quoted field at end of input', () => {
    expect(rows('a,"unclosed')).toEqual([['a', 'unclosed']])
  })
})

describe('sniffDelimiter', () => {
  it('picks the delimiter the head of the file actually parses with', () => {
    expect(sniffDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(sniffDelimiter('a\tb\n1\t2')).toBe('\t')
    expect(sniffDelimiter('a|b\n1|2')).toBe('|')
  })

  // A comma inside quotes is not a column break, so semicolons win here.
  it('is not fooled by delimiters inside quoted fields', () => {
    expect(sniffDelimiter('"a,b";c\n"d,e";f')).toBe(';')
  })

  it('falls back to a comma when nothing separates anything', () => {
    expect(sniffDelimiter('just one column\nand another line')).toBe(',')
  })
})

describe('delimitedKind', () => {
  const side = (name, content) => ({ name, content })

  it('offers the grid when both sides are CSV that parse the same way', () => {
    expect(delimitedKind(side('a.csv', 'x,y\n1,2'), side('b.csv', 'x,y\n3,4'))).toBe(',')
  })

  it('treats .tsv as tab-separated regardless of content', () => {
    expect(delimitedKind(side('a.tsv', 'x\ty'), side('b.tsv', 'x\ty'))).toBe('\t')
  })

  it('declines when the sides disagree, or are not delimited at all', () => {
    expect(delimitedKind(side('a.csv', 'x,y'), side('b.csv', 'x;y\n1;2'))).toBeNull()
    expect(delimitedKind(side('a.csv', 'x,y'), side('b.txt', 'x,y'))).toBeNull()
    expect(delimitedKind(side('a.csv', '   '), side('b.csv', 'x,y'))).toBeNull()
  })
})
