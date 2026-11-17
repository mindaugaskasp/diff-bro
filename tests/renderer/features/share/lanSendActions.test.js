import { beforeEach, describe, expect, it, vi } from 'vitest'

const showNotice = vi.fn()
const draftEntry = vi.fn((d) => ({
  name: d.name,
  snapshot: d.snapshot,
  createdAt: 1,
  expiresAt: 2
}))
const entryForShare = vi.fn(async () => ({
  name: 'saved',
  snapshot: {},
  createdAt: 1,
  expiresAt: 2
}))
vi.mock('../../../../src/renderer/src/stores/diffStore', () => ({
  useDiffStore: () => ({ showNotice })
}))
vi.mock('../../../../src/renderer/src/stores/vaultStore', () => ({
  useVaultStore: () => ({ draftEntry, entryForShare })
}))
vi.mock('../../../../src/renderer/src/i18n', () => ({
  t: (key, p) => `${key}${p ? JSON.stringify(p) : ''}`
}))
const { lanSendActions } =
  await import('../../../../src/renderer/src/features/share/lanSendActions')

const store = (over = {}) => ({
  shareDraft: null,
  shareEntryId: null,
  shareSnippet: null,
  sending: false,
  sendFailure: null,
  dismissShare: vi.fn(),
  shareTo: vi.fn(),
  ...lanSendActions,
  ...over
})

beforeEach(() => {
  showNotice.mockClear()
  window.api = { lanSend: vi.fn(async () => ({ ok: true, sent: ['Ben'], failed: [] })) }
})

describe('sending on the network', () => {
  it('sends a snippet by id and says who it went to', async () => {
    const s = store()
    s.openSnippetShare({ id: 's1', name: 'nginx', content: 'x', language: 'shell' })
    await s.sendTo(['fp1'])
    expect(window.api.lanSend).toHaveBeenCalledWith({
      snippet: { id: 's1', name: 'nginx', content: 'x', language: 'shell' },
      fps: ['fp1']
    })
    expect(showNotice).toHaveBeenCalledWith('lan.share.sent{"names":"Ben"}')
    expect(s.dismissShare).toHaveBeenCalled()
    expect(s.sending).toBe(false)
  })

  it('sends the draft diff, or the saved one', async () => {
    const s = store({ shareDraft: { name: 'd', snapshot: { a: 1 } } })
    await s.sendTo(['fp1'])
    expect(window.api.lanSend.mock.calls[0][0].diff).toMatchObject({ name: 'd' })
    const saved = store({ shareEntryId: 'e1' })
    await saved.sendTo(['fp1'])
    expect(entryForShare).toHaveBeenCalledWith('e1')
  })

  it('does nothing with nobody picked or nothing to send', async () => {
    await store({ shareSnippet: { id: 's' } }).sendTo([])
    await store().sendTo(['fp1'])
    expect(window.api.lanSend).not.toHaveBeenCalled()
  })

  it('keeps what is needed to create a file when a send fails', async () => {
    window.api.lanSend = vi.fn(async () => ({
      ok: true,
      sent: [],
      failed: [{ name: 'Ben', reason: 'offline' }]
    }))
    const s = store({ shareEntryId: 'e1' })
    await s.sendTo(['fp1'])
    expect(s.sendFailure).toMatchObject({
      names: ['Ben'],
      fps: ['fp1'],
      snippet: false,
      entryId: 'e1'
    })
    await s.createFileAfterFailure()
    expect(s.shareTo).toHaveBeenCalledWith(['fp1'])
    expect(s.sendFailure).toBeNull()
  })

  it('says it could not send when main refuses', async () => {
    window.api.lanSend = vi.fn(async () => ({ error: 'secret' }))
    const s = store({ shareSnippet: { id: 's' } })
    await s.sendTo(['fp1'])
    expect(showNotice).toHaveBeenCalledWith('lan.share.failed')
    expect(s.dismissShare).not.toHaveBeenCalled()
    s.sendFailure = { fps: [] }
    s.closeSendFailure()
    expect(s.sendFailure).toBeNull()
  })
})
