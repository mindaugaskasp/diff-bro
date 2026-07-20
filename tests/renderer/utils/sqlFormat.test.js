import { describe, expect, it } from 'vitest'
import { formatSql, validateSql } from '../../../src/renderer/src/utils/sqlFormat'

describe('formatSql', () => {
  it('breaks clauses onto their own lines and upper-cases keywords', () => {
    const out = formatSql('select a, b from users where a > 1 order by a desc')
    expect(out).toBe('SELECT a, b\nFROM users\nWHERE a > 1\nORDER BY a DESC')
  })

  it('indents joins and boolean conditions', () => {
    const out = formatSql('select * from a join b on a.id = b.id where x = 1 and y = 2')
    expect(out.split('\n')).toEqual([
      'SELECT *',
      'FROM a',
      '  JOIN b',
      '  ON a.id = b.id',
      'WHERE x = 1',
      '  AND y = 2'
    ])
  })

  it('never rewrites the contents of string literals', () => {
    const out = formatSql("select 'from where and' as note from t")
    expect(out).toContain("'from where and'")
    expect(out).toContain('FROM t')
  })
})

describe('validateSql', () => {
  it('accepts a well-formed statement', () => {
    expect(validateSql('SELECT * FROM t WHERE a = 1')).toEqual({ valid: true })
  })

  it('requires a leading statement keyword', () => {
    expect(validateSql('hello world').valid).toBe(false)
  })

  it('flags unbalanced parentheses', () => {
    expect(validateSql('SELECT * FROM t WHERE a = (1').error).toContain('parentheses')
  })

  it('flags an unbalanced quote (ignoring quotes inside balanced strings)', () => {
    expect(validateSql("SELECT 'oops FROM t").error).toContain('quote')
    expect(validateSql("SELECT 'ok' FROM t").valid).toBe(true)
  })

  it('rejects empty input', () => {
    expect(validateSql('   ').valid).toBe(false)
  })
})
