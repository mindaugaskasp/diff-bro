import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openWithFromCli } from '../../../src/renderer/src/utils/openWithFlow'

const read = (path) => ({ path, name: path.split('/').pop(), content: `body of ${path}` })

function fakeStores({ answer = 'tab', tabs = [] } = {}) {
  const diff = { left: null, right: null, blockedFiles: [], receive: vi.fn(), showNotice: vi.fn() }
  diff.receive.mockImplementation((side, file) => (diff[side] = file))
  const stores = {
    diff,
    tabs: {
      tabs,
      active: null,
      canHost: () => true,
      newTab: vi.fn(),
      markActiveOpenWith: vi.fn(),
      openSnippet: vi.fn()
    },
    openWith: { ask: vi.fn(async () => answer) }
  }
  stores.tabs.markActiveOpenWith.mockImplementation(() => (stores.tabs.active = { openWith: true }))
  return stores
}

const openedTab = (path) => ({
  kind: 'snippet',
  title: path.split('/').pop(),
  snippet: { id: null, initial: { openedPath: path } }
})

describe('openWithFromCli', () => {
  beforeEach(() => {
    globalThis.window = { api: { readFile: vi.fn(async (path) => read(path)) } }
  })

  it('opens one file as an unsaved snippet tab', async () => {
    const stores = fakeStores()
    await openWithFromCli(stores, ['/w/config.yaml'])
    expect(stores.tabs.openSnippet).toHaveBeenCalledWith(
      expect.objectContaining({ id: null, initialName: 'config.yaml', initialLanguage: 'yaml' }),
      'config.yaml'
    )
    expect(stores.diff.receive).not.toHaveBeenCalled()
  })

  it('compares files opened together', async () => {
    const stores = fakeStores()
    await openWithFromCli(stores, ['/w/a.txt', '/w/b.txt'])
    expect(stores.diff.receive.mock.calls.map(([side, f]) => [side, f.name])).toEqual([
      ['left', 'a.txt'],
      ['right', 'b.txt']
    ])
    expect(stores.tabs.openSnippet).not.toHaveBeenCalled()
  })

  it('asks before a second file, and Compare puts the first on the left', async () => {
    const stores = fakeStores({ answer: 'compare', tabs: [openedTab('/w/a.txt')] })
    await openWithFromCli(stores, ['/w/b.txt'])
    expect(stores.openWith.ask).toHaveBeenCalledWith({ previous: 'a.txt', next: 'b.txt' })
    expect(stores.diff.receive.mock.calls.map(([side, f]) => [side, f.name])).toEqual([
      ['left', 'a.txt'],
      ['right', 'b.txt']
    ])
  })

  it('a binary file goes to the comparison view, never a snippet', async () => {
    window.api.readFile = vi.fn(async (path) => ({ error: 'binary', name: 'x.bin', path }))
    const stores = fakeStores()
    await openWithFromCli(stores, ['/w/x.bin'])
    expect(stores.tabs.openSnippet).not.toHaveBeenCalled()
    expect(stores.diff.receive).toHaveBeenCalledWith(
      'left',
      expect.objectContaining({ error: 'binary' })
    )
  })
})
