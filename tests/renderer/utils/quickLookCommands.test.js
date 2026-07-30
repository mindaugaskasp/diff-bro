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
    expect(rank('base64', items).map((i) => i.id)).toEqual(['base64'])
  })

  it('runs the shared TEXT_TOOLS transforms (HTML entities)', () => {
    expect(runConvert('html', '<a> & </a>').output).toContain('&lt;a&gt;')
  })

  it('reports a failed conversion instead of throwing', () => {
    // An out-of-range code point makes the entity decoder throw.
    expect(runConvert('html', '&#x110000;')).toEqual({ error: 'convert-failed' })
  })

  it('treats panel tools as having no text conversion', () => {
    const items = convertItems()
    for (const id of ['base64', 'epoch', 'uuid', 'url', 'jwt', 'json', 'lines']) {
      expect(items.find((i) => i.id === id)).toMatchObject({ panel: id })
      // The rich panel renders instead — there is nothing to text-convert.
      expect(runConvert(id, 'x')).toEqual({ output: '' })
    }
  })

  it('handles empty input and unknown tools without throwing', () => {
    expect(runConvert('html', '')).toEqual({ output: '' })
    expect(runConvert('nope', 'x')).toEqual({ error: 'unknown-tool' })
  })
})
