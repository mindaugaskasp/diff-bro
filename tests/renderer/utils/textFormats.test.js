import { describe, expect, it } from 'vitest'
import {
  detectTextFormat,
  formatJson,
  formatXml,
  validateJson,
  validateXml
} from '../../../src/renderer/src/utils/textFormats'

describe('detectTextFormat', () => {
  it('returns null for empty or plain-text content', () => {
    expect(detectTextFormat('')).toBeNull()
    expect(detectTextFormat('   ')).toBeNull()
    expect(detectTextFormat('just some text')).toBeNull()
  })

  it('detects valid JSON', () => {
    expect(detectTextFormat('{"a": 1}')).toEqual({ kind: 'json', valid: true })
    expect(detectTextFormat('[1, 2, 3]')).toEqual({ kind: 'json', valid: true })
  })

  it('detects JSON-shaped but invalid content', () => {
    const result = detectTextFormat('{"a": 1,}')
    expect(result.kind).toBe('json')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('detects valid XML', () => {
    expect(detectTextFormat('<root><a>1</a></root>')).toEqual({ kind: 'xml', valid: true })
  })

  it('detects XML-shaped but invalid content', () => {
    const result = detectTextFormat('<root><a>1</root>')
    expect(result.kind).toBe('xml')
    expect(result.valid).toBe(false)
  })
})

describe('validateJson / formatJson', () => {
  it('accepts valid JSON and pretty-prints it', () => {
    expect(validateJson('{"a":1}')).toEqual({ valid: true })
    expect(formatJson('{"a":1,"b":[1,2]}')).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}')
  })

  it('rejects malformed JSON with an error message', () => {
    const result = validateJson('{bad}')
    expect(result.valid).toBe(false)
    expect(typeof result.error).toBe('string')
  })

  it('reports the line and column of a single-line JSON error', () => {
    const result = validateJson('{"a": 1,}')
    expect(result.valid).toBe(false)
    expect(result.line).toBe(1)
    expect(result.column).toBe(9)
  })

  it('reports the line and column of a multi-line JSON error', () => {
    const result = validateJson('{\n  "a": 1,\n  "b": 2,\n}')
    expect(result.valid).toBe(false)
    expect(result.line).toBe(4)
    expect(result.column).toBe(1)
  })
})

describe('validateXml', () => {
  it('accepts well-formed XML, including self-closing and nested tags', () => {
    expect(validateXml('<a><b/><c>text</c></a>')).toEqual({ valid: true })
  })

  it('ignores comments, CDATA, and declarations when scanning tags', () => {
    expect(
      validateXml('<?xml version="1.0"?><a><!-- <fake> --><![CDATA[<also fake>]]></a>')
    ).toEqual({ valid: true })
  })

  it('rejects mismatched closing tags, with the location of the bad closing tag', () => {
    const result = validateXml('<a><b></c></a>')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Mismatched')
    expect(result.line).toBe(1)
    expect(result.column).toBe(7)
  })

  it('rejects unclosed tags, with the location of the innermost unclosed tag', () => {
    const result = validateXml('<a><b>')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unclosed')
    expect(result.line).toBe(1)
    expect(result.column).toBe(4)
  })

  it('reports the line and column of a multi-line mismatch against the original (unstripped) content', () => {
    const result = validateXml('<a>\n  <b></c>\n</a>')
    expect(result.valid).toBe(false)
    expect(result.line).toBe(2)
    expect(result.column).toBe(6)
  })

  it('rejects content with no elements at all', () => {
    expect(validateXml('<!-- just a comment -->').valid).toBe(false)
  })
})

describe('formatXml', () => {
  it('reindents nested elements by depth', () => {
    expect(formatXml('<a><b><c>text</c></b></a>')).toBe('<a>\n  <b>\n    <c>text</c>\n  </b>\n</a>')
  })

  it('leaves already-pretty XML output stable (idempotent)', () => {
    const once = formatXml('<a><b>1</b><c>2</c></a>')
    expect(formatXml(once)).toBe(once)
  })
})
