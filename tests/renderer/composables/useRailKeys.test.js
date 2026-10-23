import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useRailKeys } from '../../../src/renderer/src/composables/useRailKeys'

const key = (k) => ({ key: k, preventDefault: vi.fn() })

describe('useRailKeys', () => {
  const setup = (current = 'home') => {
    const select = vi.fn()
    const onKeydown = useRailKeys(ref(['home', 'diffs', 'snippets', 'tools']), ref(current), select)
    return { select, onKeydown }
  }

  it('moves down and up through the rail', () => {
    const { select, onKeydown } = setup('diffs')
    onKeydown(key('ArrowDown'))
    onKeydown(key('ArrowUp'))
    expect(select.mock.calls).toEqual([['snippets'], ['home']])
  })

  it('wraps at either end', () => {
    const { select, onKeydown } = setup('tools')
    onKeydown(key('ArrowDown'))
    expect(select).toHaveBeenLastCalledWith('home')
  })

  it('jumps to the first and last with Home and End', () => {
    const { select, onKeydown } = setup('snippets')
    onKeydown(key('Home'))
    onKeydown(key('End'))
    expect(select.mock.calls).toEqual([['home'], ['tools']])
  })

  it('leaves every other key to the page', () => {
    const { select, onKeydown } = setup()
    const e = key('a')
    onKeydown(e)
    expect(select).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})
