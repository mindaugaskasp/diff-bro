import { describe, expect, it } from 'vitest'
import { flattenCommands } from '../../../src/renderer/src/utils/commandPalette'
import { rank } from '../../../src/renderer/src/utils/quickLook'

const noop = () => {}
const MENUS = [
  {
    label: 'File',
    items: [
      { label: 'Open Left', keys: 'Ctrl+1', run: noop },
      { sep: true },
      { label: 'Reset Zoom', paletteHidden: true, run: noop },
      { label: 'Quit', run: noop }
    ]
  },
  {
    label: 'Tools',
    items: [
      { label: 'JSON', items: [{ label: 'Format / Validate', keys: 'Ctrl+Shift+J', run: noop }] },
      { label: 'JWT Decode', run: noop }
    ]
  }
]

describe('flattenCommands', () => {
  it('drops separators, group headers and paletteHidden items, keeps runnable leaves', () => {
    const cmds = flattenCommands(MENUS)
    expect(cmds.map((c) => c.name)).toEqual([
      'Open Left',
      'Quit',
      'JSON · Format / Validate',
      'JWT Decode'
    ])
    expect(cmds.some((c) => c.name === 'Reset Zoom')).toBe(false)
  })

  it('folds a submenu label into its leaf and tags the top-level group', () => {
    const json = flattenCommands(MENUS).find((c) => c.name.startsWith('JSON'))
    expect(json).toMatchObject({
      name: 'JSON · Format / Validate',
      group: 'Tools',
      keys: 'Ctrl+Shift+J'
    })
    expect(typeof json.run).toBe('function')
  })

  it('defaults keys to an empty string when a command has no accelerator', () => {
    expect(flattenCommands(MENUS).find((c) => c.name === 'Quit').keys).toBe('')
  })

  it('tolerates an empty or missing menu tree', () => {
    expect(flattenCommands([])).toEqual([])
    expect(flattenCommands(undefined)).toEqual([])
  })

  it('is searchable through the shared rank() by folded name', () => {
    const cmds = flattenCommands(MENUS)
    expect(rank('json', cmds).map((c) => c.name)).toEqual(['JSON · Format / Validate'])
    expect(rank('', cmds)).toHaveLength(4) // empty query keeps input order
  })
})
