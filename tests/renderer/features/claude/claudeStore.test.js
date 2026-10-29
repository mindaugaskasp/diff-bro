import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const snippetAdd = vi.fn()
const snippetRemove = vi.fn()
const vaultSave = vi.fn()
const vaultRemove = vi.fn()
const tabsOpen = vi.fn(() => 't-cmp')
const tabsOpenSnippet = vi.fn(() => 't-snip')
vi.mock('../../../../src/renderer/src/stores/snippetStore', () => ({
  useSnippetStore: () => ({ add: snippetAdd, remove: snippetRemove })
}))
vi.mock('../../../../src/renderer/src/stores/vaultStore', () => ({
  useVaultStore: () => ({ save: vaultSave, remove: vaultRemove })
}))
vi.mock('../../../../src/renderer/src/stores/tabsStore', () => ({
  useTabsStore: () => ({ open: tabsOpen, openSnippet: tabsOpenSnippet })
}))

const { CLAUDE_SCOPES, UNDO_MS, useClaudeStore } =
  await import('../../../../src/renderer/src/features/claude/claudeStore')

const off = Object.fromEntries(CLAUDE_SCOPES.map((s) => [s, false]))
const snippetProposal = {
  id: 'p1',
  kind: 'snippet',
  name: 'Fix',
  body: { name: 'Fix', content: 'select 1', language: 'sql', tags: ['db'], note: '' }
}
const comparisonProposal = {
  id: 'p2',
  kind: 'comparison',
  name: 'Before/after',
  body: { name: 'Before/after', left: 'a', right: 'b', note: '' }
}

let changed
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  window.api = {
    claudeConnection: vi.fn().mockResolvedValue({ enabled: false, scopes: off }),
    setClaudeConnection: vi.fn(async (grant) => ({ ...grant, setup: {} })),
    claudeActivity: vi.fn().mockResolvedValue([{ at: 1, tool: 'list_snippets', item: null }]),
    clearClaudeActivity: vi.fn().mockResolvedValue({ ok: true }),
    inboxList: vi.fn().mockResolvedValue([snippetProposal, comparisonProposal]),
    inboxRead: vi.fn(async (id) => [snippetProposal, comparisonProposal].find((p) => p.id === id)),
    inboxDiscard: vi.fn().mockResolvedValue({ ok: true }),
    onInboxChanged: vi.fn((fn) => (changed = fn))
  }
})

describe('claude connection', () => {
  it('does not switch on until the warning is confirmed', async () => {
    const s = useClaudeStore()
    await s.loadConnection()
    s.requestEnable()
    expect(s.confirming).toBe(true)
    expect(window.api.setClaudeConnection).not.toHaveBeenCalled()
    s.cancelEnable()
    expect(s.enabled).toBe(false)
    s.requestEnable()
    await s.confirmEnable()
    expect(window.api.setClaudeConnection).toHaveBeenCalledWith({ enabled: true, scopes: off })
    expect(s.enabled).toBe(true)
  })

  it('ignores a scope change while the connection is off', async () => {
    const s = useClaudeStore()
    await s.loadConnection()
    await s.setScope('snippets', true)
    expect(window.api.setClaudeConnection).not.toHaveBeenCalled()
  })

  it('sets one scope and keeps the rest', async () => {
    const s = useClaudeStore()
    s.connection = { enabled: true, scopes: { ...off, diffs: true } }
    await s.setScope('snippets', true)
    expect(window.api.setClaudeConnection).toHaveBeenCalledWith({
      enabled: true,
      scopes: { ...off, diffs: true, snippets: true }
    })
  })

  it('revokes every scope with the switch', async () => {
    const s = useClaudeStore()
    s.connection = { enabled: true, scopes: { ...off, diffs: true } }
    await s.disable()
    expect(window.api.setClaudeConnection).toHaveBeenCalledWith({ enabled: false, scopes: off })
  })

  it('keeps the last state and reports a failed save', async () => {
    window.api.setClaudeConnection.mockResolvedValue({ error: 'vault-key-unavailable' })
    const s = useClaudeStore()
    await s.loadConnection()
    await s.confirmEnable()
    expect(s.error).toBe('vault-key-unavailable')
    expect(s.enabled).toBe(false)
  })

  it('loads and clears the activity log', async () => {
    const s = useClaudeStore()
    await s.loadActivity()
    expect(s.activity).toHaveLength(1)
    await s.clearActivity()
    expect(s.activity).toEqual([])
  })
})

describe('claude inbox', () => {
  it('re-reads the inbox when main says it changed', async () => {
    const s = useClaudeStore()
    await s.loadInbox()
    expect(s.inbox).toHaveLength(2)
    window.api.inboxList.mockResolvedValue([])
    await changed()
    expect(s.inbox).toEqual([])
  })

  it('accepts a snippet through the snippet store, then clears it', async () => {
    vi.useFakeTimers()
    snippetAdd.mockResolvedValue('new-id')
    const s = useClaudeStore()
    await s.loadInbox()
    await s.accept('p1')
    expect(snippetAdd).toHaveBeenCalledWith({
      name: 'Fix',
      content: 'select 1',
      language: 'sql',
      tags: ['db']
    })
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(window.api.inboxDiscard).toHaveBeenCalledWith('p1')
    expect(s.inbox.map((p) => p.id)).toEqual(['p2'])
    vi.useRealTimers()
  })

  it('accepts a comparison as a kept saved diff', async () => {
    vaultSave.mockResolvedValue('d1')
    await useClaudeStore().accept('p2')
    const [name, ttl, payload] = vaultSave.mock.calls[0]
    expect([name, ttl]).toEqual(['Before/after', null])
    expect(payload).toMatchObject({ mode: 'paste', pasteLeft: 'a', pasteRight: 'b' })
  })

  it('keeps the proposal when saving it failed', async () => {
    snippetAdd.mockResolvedValue(null)
    await useClaudeStore().accept('p1')
    expect(window.api.inboxDiscard).not.toHaveBeenCalled()
  })

  it('opens a comparison for review in a tab, without saving anything', async () => {
    const s = useClaudeStore()
    await s.open('p2')
    expect(tabsOpen).toHaveBeenCalledWith(
      expect.objectContaining({ pasteLeft: 'a', pasteRight: 'b' }),
      { name: 'Before/after' }
    )
    expect(vaultSave).not.toHaveBeenCalled()
    expect(s.reviewing).toEqual({ 't-cmp': 'p2' })
  })

  // A snippet is reviewed as a snippet: an unsaved document, every field editable.
  it('opens a snippet for review as an unsaved snippet document', async () => {
    const s = useClaudeStore()
    await s.open('p1')
    expect(tabsOpenSnippet).toHaveBeenCalledWith(
      {
        id: null,
        initialName: 'Fix',
        initialContent: 'select 1',
        initialLanguage: 'sql',
        initialTags: ['db']
      },
      'Fix'
    )
    expect(s.reviewing).toEqual({ 't-snip': 'p1' })
    s.stopReviewing('t-snip')
    expect(s.reviewing).toEqual({})
  })

  it('refreshes instead of acting on a proposal that is already gone', async () => {
    window.api.inboxRead.mockResolvedValue(null)
    const s = useClaudeStore()
    await s.accept('p1')
    expect(snippetAdd).not.toHaveBeenCalled()
    expect(window.api.inboxList).toHaveBeenCalled()
  })
})

describe('connecting a Claude app', () => {
  const absent = { code: { available: true, status: 'absent' }, desktop: null }
  const connected = { code: { available: true, status: 'current' }, desktop: null }

  beforeEach(() => {
    setActivePinia(createPinia())
    window.api = {
      claudeApps: vi.fn(async () => absent),
      connectClaudeApp: vi.fn(async () => ({ ok: true, apps: connected }))
    }
  })

  it('reads which apps are installed and connected', async () => {
    const claude = useClaudeStore()
    await claude.loadApps()
    expect(claude.apps).toEqual(absent)
  })

  it('asks main to connect the named app and takes the status it reports back', async () => {
    const claude = useClaudeStore()
    await claude.connectApp('code')
    expect(window.api.connectClaudeApp).toHaveBeenCalledWith('code')
    expect(claude.apps).toEqual(connected)
    expect(claude.connectResult).toEqual({ target: 'code', outcome: 'ok' })
  })

  it('reports a failure against the app it was for', async () => {
    window.api.connectClaudeApp = vi.fn(async () => ({ error: 'cli-failed', apps: absent }))
    const claude = useClaudeStore()
    await claude.connectApp('code')
    expect(claude.connectResult).toEqual({ target: 'code', outcome: 'cli-failed' })
  })

  it('says nothing when the confirmation was cancelled', async () => {
    window.api.connectClaudeApp = vi.fn(async () => ({ canceled: true, apps: absent }))
    const claude = useClaudeStore()
    await claude.connectApp('code')
    expect(claude.connectResult).toBeNull()
  })
})

// #121: proposals live atop Snippets and Diffs, act in bulk, and every act undoes.
describe('reviewing proposals', () => {
  const loaded = async () => {
    const s = useClaudeStore()
    await s.loadInbox()
    return s
  }

  it('splits what is waiting into snippets and comparisons', async () => {
    const s = await loaded()
    expect(s.snippetProposals.map((p) => p.id)).toEqual(['p1'])
    expect(s.diffProposals.map((p) => p.id)).toEqual(['p2'])
  })

  it('hides an accepted proposal at once and clears it only after the undo window', async () => {
    vi.useFakeTimers()
    snippetAdd.mockResolvedValue('new-id')
    const s = await loaded()
    await s.accept('p1')
    expect(s.snippetProposals).toEqual([])
    expect(window.api.inboxDiscard).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(window.api.inboxDiscard).toHaveBeenCalledWith('p1')
    vi.useRealTimers()
  })

  it('undoing an accept removes what it saved and brings the proposal back', async () => {
    vi.useFakeTimers()
    snippetAdd.mockResolvedValue('new-id')
    const s = await loaded()
    await s.accept('p1')
    await s.undo()
    expect(snippetRemove).toHaveBeenCalledWith('new-id')
    expect(s.snippetProposals.map((p) => p.id)).toEqual(['p1'])
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(window.api.inboxDiscard).not.toHaveBeenCalled()
    expect(s.undoable).toBeNull()
    vi.useRealTimers()
  })

  it('undoes a discard', async () => {
    vi.useFakeTimers()
    const s = await loaded()
    await s.discard('p2')
    expect(s.diffProposals).toEqual([])
    await s.undo()
    expect(s.diffProposals.map((p) => p.id)).toEqual(['p2'])
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(window.api.inboxDiscard).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('accepts the selected proposals together, and one undo takes them all back', async () => {
    snippetAdd.mockResolvedValue('s1')
    vaultSave.mockResolvedValue('d1')
    const s = await loaded()
    s.toggleSelected('p1')
    s.toggleSelected('p2')
    await s.acceptSelected()
    expect(s.selected).toEqual([])
    expect(s.snippetProposals).toEqual([])
    expect(s.diffProposals).toEqual([])
    await s.undo()
    expect(snippetRemove).toHaveBeenCalledWith('s1')
    expect(vaultRemove).toHaveBeenCalledWith('d1')
    expect(s.snippetProposals.map((p) => p.id)).toEqual(['p1'])
  })

  it('discards the selected proposals together', async () => {
    const s = await loaded()
    s.toggleSelected('p1')
    s.toggleSelected('p2')
    await s.discardSelected()
    expect(s.snippetProposals).toEqual([])
    expect(s.diffProposals).toEqual([])
    expect(snippetAdd).not.toHaveBeenCalled()
  })

  it('settles a proposal accepted from its own tab with what that tab saved', async () => {
    const s = await loaded()
    s.settleAccepted('p1', 'edited-id')
    expect(s.snippetProposals).toEqual([])
    await s.undo()
    expect(snippetRemove).toHaveBeenCalledWith('edited-id')
  })
})
