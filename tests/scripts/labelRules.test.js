import { describe, expect, it } from 'vitest'
import { labelProblems } from '../../scripts/lib/labelRules.mjs'

describe('labelProblems', () => {
  it('passes Title Case menu items, small words lower', () => {
    const tree = {
      menu: { edit: { copyPatch: 'Diff as Patch', toggle: 'Toggle Light/Dark Theme' } }
    }
    expect(labelProblems(tree)).toEqual([])
  })

  it('flags a menu item that is not Title Case', () => {
    const tree = { menu: { view: { merge: 'Merge conflicts…' } } }
    expect(labelProblems(tree)).toEqual([
      'menu.view.merge: menu items are Title Case ("Merge conflicts…")'
    ])
  })

  it('leaves labels outside menu.* to sentence case', () => {
    expect(labelProblems({ toolbar: { copy: 'Copy diff' } })).toEqual([])
  })

  it('flags a retired synonym anywhere in the catalogue', () => {
    const tree = { keysPanel: { send: 'Send my key' }, toolbar: { mode: 'Paste text mode' } }
    expect(labelProblems(tree)).toEqual([
      'keysPanel.send: retired wording "Send my key" (Share is the verb for your key)',
      'toolbar.mode: retired wording "Paste text mode" (it is Paste mode)'
    ])
  })
})
