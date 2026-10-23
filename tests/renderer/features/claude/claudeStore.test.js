import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const snippetAdd = vi.fn()
const vaultSave = vi.fn()
const tabsOpen = vi.fn()
vi.mock('../../../../src/renderer/src/stores/snippetStore', () => ({
  useSnippetStore: () => ({ add: snippetAdd })
}))
vi.mock('../../../../src/renderer/src/stores/vaultStore', () => ({
  useVaultStore: () => ({ save: vaultSave })
}))
vi.mock('../../../../src/renderer/src/stores/tabsStore', () => ({
  useTabsStore: () => ({ open: tabsOpen })
}))

const { CLAUDE_SCOPES, useClaudeStore } =
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
    expect(window.api.inboxDiscard).toHaveBeenCalledWith('p1')
    expect(s.inbox.map((p) => p.id)).toEqual(['p2'])
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

  it('previews in a tab without saving anything', async () => {
    await useClaudeStore().preview('p2')
    expect(tabsOpen).toHaveBeenCalledWith(
      expect.objectContaining({ pasteLeft: 'a', pasteRight: 'b' }),
      { name: 'Before/after' }
    )
    expect(vaultSave).not.toHaveBeenCalled()
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
