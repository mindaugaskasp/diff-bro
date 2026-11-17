import { describe, expect, it, vi } from 'vitest'

const open = vi.fn(() => 'tab-d')
const openSnippet = vi.fn(() => 'tab-s')
const tabs = [{ id: 'tab-d' }]
vi.mock('../../../../src/renderer/src/stores/tabsStore', () => ({
  useTabsStore: () => ({ open, openSnippet, tabs })
}))
const { arePopupsShown, openReceivedEntry, receivedTag, withoutId } =
  await import('../../../../src/renderer/src/features/lan/itemActions')
const { SILENCE_CHOICES, silenceLabelKey } =
  await import('../../../../src/renderer/src/features/lan/silenceChoices')

describe('opening a received entry', () => {
  it('opens a snippet as an unsaved draft with its language and tags', () => {
    const tab = openReceivedEntry({
      kind: 'snippet',
      name: 'nginx reload',
      snippet: { content: 'x', language: 'shell', tags: ['ops'] }
    })
    expect(tab).toBe('tab-s')
    expect(openSnippet).toHaveBeenCalledWith(
      {
        id: null,
        initialName: 'nginx reload',
        initialContent: 'x',
        initialLanguage: 'shell',
        initialTags: ['ops']
      },
      'nginx reload'
    )
  })

  it('defaults a snippet’s language and tags', () => {
    openReceivedEntry({ kind: 'snippet', name: 'n', snippet: { content: '' } })
    expect(openSnippet.mock.calls.at(-1)[0]).toMatchObject({
      initialLanguage: 'auto',
      initialTags: []
    })
  })

  it('opens a diff from its snapshot', () => {
    expect(openReceivedEntry({ kind: 'diff', name: 'cfg', snapshot: { pasteLeft: 'a' } })).toBe(
      'tab-d'
    )
    expect(open.mock.calls.at(-1)[0]).toMatchObject({ pasteLeft: 'a' })
    expect(open.mock.calls.at(-1)[1]).toEqual({ name: 'cfg' })
  })
})

describe('tagging what arrived on the network', () => {
  it('nests the sender under lan', () => {
    expect(receivedTag('Ana Petrauskė')).toBe('lan/ana petrauskė')
  })

  it('keeps a slash in the name from nesting deeper', () => {
    expect(receivedTag('ops/infra laptop')).toBe('lan/ops-infra laptop')
  })

  it('adds the tag to a snippet beside its own tags', () => {
    openReceivedEntry(
      { kind: 'snippet', name: 'n', snippet: { content: '', tags: ['ops'] } },
      'Ana'
    )
    expect(openSnippet.mock.calls.at(-1)[0].initialTags).toEqual(['ops', 'lan/ana'])
  })

  it('suggests the tag when a diff is saved', () => {
    openReceivedEntry({ kind: 'diff', name: 'cfg', snapshot: {} }, 'Ana')
    expect(tabs[0].suggestedTags).toEqual(['lan/ana'])
  })
})

describe('helpers', () => {
  it('shows popups only when on and not silenced', () => {
    expect(arePopupsShown({ popups: true, silencedUntil: 0 }, 10)).toBe(true)
    expect(arePopupsShown({ popups: true, silencedUntil: 20 }, 10)).toBe(false)
    expect(arePopupsShown({ popups: false, silencedUntil: 0 }, 10)).toBe(false)
  })

  it('removes by id from objects or plain ids', () => {
    expect(withoutId([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }])
    expect(withoutId(['a', 'b'], 'b')).toEqual(['a'])
  })

  it('names every silence choice, falling back to an hour', () => {
    expect(SILENCE_CHOICES.map((c) => c.value)).toEqual([1, 5, 10, 30, 60, 1440, 'forever'])
    expect(silenceLabelKey('forever')).toBe('lan.silence.choice.forever')
    expect(silenceLabelKey(7)).toBe('lan.silence.choice.60')
  })
})
