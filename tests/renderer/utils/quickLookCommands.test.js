import { describe, expect, it } from 'vitest'
import {
  CONVERT_TOOLS,
  convertItems,
  runConvert
} from '../../../src/renderer/src/utils/quickLookCommands'
import { rank } from '../../../src/renderer/src/utils/quickLook'

describe('convert tools', () => {
  it('exposes each tool as a searchable command item', () => {
    const items = convertItems()
    expect(items).toHaveLength(CONVERT_TOOLS.length)
    expect(items.every((i) => i.kind === 'command')).toBe(true)
    // searchable by name through the shared rank()
    expect(rank('base64', items).map((i) => i.id)).toEqual(['base64-encode', 'base64-decode'])
  })

  it('round-trips base64 encode and decode', () => {
    const enc = runConvert('base64-encode', 'hello')
    expect(enc.output).toBe('aGVsbG8=')
    expect(runConvert('base64-decode', enc.output)).toEqual({ output: 'hello' })
  })

  it('is Unicode-safe', () => {
    const enc = runConvert('base64-encode', 'héllo €')
    expect(runConvert('base64-decode', enc.output)).toEqual({ output: 'héllo €' })
  })

  it('reports malformed base64 instead of throwing', () => {
    expect(runConvert('base64-decode', 'not valid base64 !!!')).toEqual({ error: 'convert-failed' })
  })

  it('runs the shared TEXT_TOOLS transforms (HTML entities)', () => {
    expect(runConvert('html', '<a> & </a>').output).toContain('&lt;a&gt;')
  })

  it('treats panel tools (epoch/uuid/url/jwt/json) as having no text conversion', () => {
    const items = convertItems()
    for (const id of ['epoch', 'uuid', 'url', 'jwt', 'json']) {
      expect(items.find((i) => i.id === id)).toMatchObject({ panel: id })
      // The rich panel renders instead — there is nothing to text-convert.
      expect(runConvert(id, 'x')).toEqual({ output: '' })
    }
  })

  it('handles empty input and unknown tools without throwing', () => {
    expect(runConvert('base64-encode', '')).toEqual({ output: '' })
    expect(runConvert('nope', 'x')).toEqual({ error: 'unknown-tool' })
  })
})
