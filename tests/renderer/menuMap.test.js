import { beforeAll, describe, expect, it } from 'vitest'
import { buildMenus } from '../../src/renderer/src/menus'
import { MENU_MAP, menuPaths } from '../menuMap.fixture'

const isNotACommand = (item) => item.sep || item.info || item.devOnly || item.label === 'Quit'

describe('the in-app menu bar', () => {
  beforeAll(() => {
    window.api = new Proxy({ appVersion: '0.0.0-test' }, { get: (t, k) => t[k] ?? (() => {}) })
  })

  it('is the approved menu map, item for item', () => {
    const tree = buildMenus(() => {}).map((section) => ({
      label: section.label,
      items: section.items
    }))
    expect(menuPaths(tree, 'items', isNotACommand)).toEqual(MENU_MAP)
  })
})
