import { describe, expect, it } from 'vitest'
import { openWithTarget } from '../../../src/renderer/src/utils/openWithRouting'

// Left, then right of that same tab, then a new tab. Derived from state, so an
// action between two opens cannot desync the cycle for good.
const tab = (over = {}) => ({ id: 't1', openWith: true, ...over })

describe('openWithTarget', () => {
  it('opens the first file in a new tab, on the left', () => {
    expect(openWithTarget({ active: null, hasLeft: false, hasRight: false })).toEqual({
      newTab: true,
      side: 'left'
    })
  })

  it('puts the second file on the right of the same tab', () => {
    expect(openWithTarget({ active: tab(), hasLeft: true, hasRight: false })).toEqual({
      newTab: false,
      side: 'right'
    })
  })

  it('starts a new tab again for the third', () => {
    expect(openWithTarget({ active: tab(), hasLeft: true, hasRight: true })).toEqual({
      newTab: true,
      side: 'left'
    })
  })

  // Landing in a comparison the reader set up by hand would overwrite it.
  it('will not fill the right of a tab it did not open', () => {
    expect(
      openWithTarget({ active: tab({ openWith: false }), hasLeft: true, hasRight: false })
    ).toEqual({ newTab: true, side: 'left' })
  })

  it('starts a new tab when the previous one was closed', () => {
    expect(openWithTarget({ active: null, hasLeft: true, hasRight: false })).toEqual({
      newTab: true,
      side: 'left'
    })
  })

  // An open-with tab whose left the reader cleared is still theirs to fill.
  it('fills the left of an empty tab it opened rather than making another', () => {
    expect(openWithTarget({ active: tab(), hasLeft: false, hasRight: false })).toEqual({
      newTab: false,
      side: 'left'
    })
  })

  it('repeats the cycle across four files', () => {
    const seen = []
    let state = { active: null, hasLeft: false, hasRight: false }
    for (let i = 0; i < 4; i++) {
      const target = openWithTarget(state)
      seen.push(`${target.newTab ? 'new' : 'same'}:${target.side}`)
      const active = target.newTab ? tab({ id: `t${i}` }) : state.active
      state = {
        active,
        hasLeft: target.newTab ? true : state.hasLeft || target.side === 'left',
        hasRight: target.newTab ? false : target.side === 'right'
      }
    }
    expect(seen).toEqual(['new:left', 'same:right', 'new:left', 'same:right'])
  })
})
