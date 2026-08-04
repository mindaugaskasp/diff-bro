import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const notices = []
vi.mock('../../../../src/renderer/src/stores/diffStore', () => ({
  useDiffStore: () => ({ showNotice: (m) => notices.push(m) })
}))

const { DEFAULT_SUBJECT, useEmailStore } = await import(
  '../../../../src/renderer/src/features/email/emailStore'
)

const draft = () => ({
  entry: { name: 'a ↔ b' },
  recipientFps: ['fp-ana'],
  to: [{ fingerprint: 'fp-ana', label: 'Ana', email: 'ana@example.com' }]
})

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  notices.length = 0
  window.api = { mailHandoff: vi.fn().mockResolvedValue({ ok: true, name: 'x.diffbro', copied: true }) }
})

describe('message defaults', () => {
  it('starts with the shipped template and persists a change', () => {
    const s = useEmailStore()
    expect(s.subjectTemplate).toBe(DEFAULT_SUBJECT)
    s.setSubjectTemplate('Diff: {name}')
    expect(useEmailStore().subjectTemplate).toBe('Diff: {name}')
  })

  it('falls back rather than storing a non-string', () => {
    const s = useEmailStore()
    s.setSubjectTemplate(42)
    expect(s.subjectTemplate).toBe(DEFAULT_SUBJECT)
  })

  it('resets every default at once', () => {
    const s = useEmailStore()
    s.setSubjectTemplate('x')
    s.setNoteTemplate('y')
    s.setRevealAfterCreate(false)
    s.resetTemplates()
    expect([s.subjectTemplate, s.noteTemplate, s.revealAfterCreate]).toEqual([
      DEFAULT_SUBJECT,
      '',
      true
    ])
  })
})

describe('compose', () => {
  it('opens the dialog for recipients that all have an address', () => {
    const s = useEmailStore()
    expect(s.compose(draft())).toBe(true)
    expect(s.draft.recipientFps).toEqual(['fp-ana'])
  })

  // Refused BEFORE IPC, and the message names who is missing — a blank failure
  // leaves the user hunting through thirty trusted keys.
  it('refuses a recipient with no address and names them', () => {
    const s = useEmailStore()
    const d = draft()
    d.to.push({ fingerprint: 'fp-t', label: 'Tomas', email: null })
    expect(s.compose(d)).toBe(false)
    expect(s.draft).toBeNull()
    expect(notices[0]).toContain('Tomas')
  })

  // The entry is held in a module-level holder rather than Pinia state (a
  // reactive Proxy cannot cross IPC, and plaintext has no business being
  // observable). That makes staleness the risk worth guarding.
  it('sends the newest entry, never one left over from an earlier compose', async () => {
    const s = useEmailStore()
    s.compose({ ...draft(), entry: { name: 'first' } })
    s.cancel()
    s.compose({ ...draft(), entry: { name: 'second' } })
    await s.send('')
    expect(window.api.mailHandoff.mock.calls[0][0].entry).toEqual({ name: 'second' })
  })

  it('retains nothing when the compose was refused', async () => {
    const s = useEmailStore()
    const d = draft()
    d.to = [{ fingerprint: 'fp-t', label: 'Tomas', email: null }]
    expect(s.compose(d)).toBe(false)
    await s.send('')
    expect(window.api.mailHandoff).not.toHaveBeenCalled()
  })

  it('copies the arrays, so later edits cannot mutate the draft', () => {
    const s = useEmailStore()
    const d = draft()
    s.compose(d)
    d.recipientFps.push('fp-other')
    expect(s.draft.recipientFps).toEqual(['fp-ana'])
  })
})

describe('send', () => {
  it('passes the fingerprints and template to main, never an address', async () => {
    const s = useEmailStore()
    s.compose(draft())
    await s.send('hi')
    expect(window.api.mailHandoff).toHaveBeenCalledWith({
      entry: { name: 'a ↔ b' },
      recipientFps: ['fp-ana'],
      subjectTemplate: DEFAULT_SUBJECT,
      reveal: true,
      note: 'hi'
    })
    expect(JSON.stringify(window.api.mailHandoff.mock.calls[0][0])).not.toContain('@example.com')
  })

  it('reports the clipboard when the copy landed', async () => {
    const s = useEmailStore()
    s.compose(draft())
    await s.send('')
    expect(notices[0]).toContain('on the clipboard')
    expect(s.draft).toBeNull()
  })

  it('tells the user to attach it when the copy did not land', async () => {
    window.api.mailHandoff.mockResolvedValue({ ok: true, name: 'x.diffbro', copied: false })
    const s = useEmailStore()
    s.compose(draft())
    await s.send('')
    expect(notices[0]).toContain('attach it')
  })

  // The file is written BEFORE the hand-off confirm, so cancelling there still
  // has a local twin to save — and that reply carries a path.
  it('runs onSealed when the confirm was cancelled after the write', async () => {
    const onSealed = vi.fn().mockResolvedValue(true)
    window.api.mailHandoff.mockResolvedValue({ canceled: true, path: '/tmp/x.diffbro' })
    const s = useEmailStore()
    s.compose({ ...draft(), onSealed })
    await s.send('')
    expect(onSealed).toHaveBeenCalledTimes(1)
    expect(s.draft).toBeNull()
  })

  // The regression this pair exists to catch: cancelling the OS SAVE dialog
  // wrote no file, so it must not save a twin or record a share. That reply has
  // no path, which is the only thing distinguishing it from the confirm-cancel.
  it('does NOT run onSealed when the save dialog was cancelled', async () => {
    const onSealed = vi.fn()
    window.api.mailHandoff.mockResolvedValue({ canceled: true })
    const s = useEmailStore()
    s.compose({ ...draft(), onSealed })
    await s.send('')
    expect(onSealed).not.toHaveBeenCalled()
    expect(notices[0]).toContain('nothing was sealed')
  })

  it('does not run onSealed when nothing was written', async () => {
    const onSealed = vi.fn()
    window.api.mailHandoff.mockResolvedValue({ error: 'unknown-recipient' })
    const s = useEmailStore()
    s.compose({ ...draft(), onSealed })
    await s.send('')
    expect(onSealed).not.toHaveBeenCalled()
    expect(s.draft).not.toBeNull()
  })

  it('says so when the local copy could not be saved', async () => {
    const s = useEmailStore()
    s.compose({ ...draft(), onSealed: () => Promise.resolve(false) })
    await s.send('')
    expect(notices[0]).toContain('could not be saved')
  })

  it('surfaces a rejected IPC call rather than hanging', async () => {
    window.api.mailHandoff.mockRejectedValue(new Error('boom'))
    const s = useEmailStore()
    s.compose(draft())
    await s.send('')
    expect(s.sending).toBe(false)
    expect(notices[0]).toBe('Could not open your mail app.')
  })

  it('ignores a second send while one is in flight', async () => {
    const s = useEmailStore()
    s.compose(draft())
    const first = s.send('')
    await s.send('')
    await first
    expect(window.api.mailHandoff).toHaveBeenCalledTimes(1)
  })

  it('does nothing with no draft', async () => {
    await useEmailStore().send('')
    expect(window.api.mailHandoff).not.toHaveBeenCalled()
  })
})
