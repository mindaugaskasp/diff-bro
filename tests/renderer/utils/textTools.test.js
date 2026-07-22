import { describe, expect, it } from 'vitest'
import { TEXT_TOOLS, toolStatusText } from '../../../src/renderer/src/utils/textTools'

// One dialog is driven by this table, so a malformed entry breaks a whole tool
// with no other signal — check the contract every entry has to satisfy.
describe('TEXT_TOOLS', () => {
  const ids = Object.keys(TEXT_TOOLS)

  it('covers the three format/validate tools the menu offers', () => {
    expect(ids.sort()).toEqual(['json', 'sql', 'xml'])
  })

  it.each(ids)('%s declares a complete descriptor', (id) => {
    const tool = TEXT_TOOLS[id]
    expect(typeof tool.title).toBe('string')
    expect(tool.language).toBe(id)
    expect(typeof tool.validate).toBe('function')
    expect(typeof tool.format).toBe('function')
    expect(typeof tool.validLabel).toBe('string')
    expect(typeof tool.requiresValid).toBe('boolean')
  })

  it('validates and formats through the real helpers', () => {
    expect(TEXT_TOOLS.json.validate('{"a":1}').valid).toBe(true)
    expect(TEXT_TOOLS.json.validate('{a}').valid).toBe(false)
    expect(TEXT_TOOLS.json.format('{"a":1}')).toContain('\n')
    expect(TEXT_TOOLS.xml.validate('<a><b/></a>').valid).toBe(true)
    expect(TEXT_TOOLS.xml.validate('<a></b>').valid).toBe(false)
  })

  // SQL formatting stays available on input the validator won't vouch for.
  it('only requires valid input where the formatter needs it', () => {
    expect(TEXT_TOOLS.json.requiresValid).toBe(true)
    expect(TEXT_TOOLS.xml.requiresValid).toBe(true)
    expect(TEXT_TOOLS.sql.requiresValid).toBe(false)
  })
})

describe('toolStatusText', () => {
  const json = TEXT_TOOLS.json

  it('is empty before anything is typed', () => {
    expect(toolStatusText(json, null)).toBe('')
  })

  it("uses the tool's own wording when valid", () => {
    expect(toolStatusText(json, { valid: true })).toBe('Valid JSON')
    expect(toolStatusText(TEXT_TOOLS.sql, { valid: true })).toBe('Looks valid')
  })

  it('reports the location when the validator pinned one down', () => {
    expect(
      toolStatusText(json, { valid: false, error: 'Unexpected token', line: 3, column: 7 })
    ).toBe('Invalid (line 3, column 7): Unexpected token')
  })

  it('falls back to the bare error when there is no location', () => {
    expect(toolStatusText(json, { valid: false, error: 'Unparseable' })).toBe(
      'Invalid: Unparseable'
    )
  })
})
