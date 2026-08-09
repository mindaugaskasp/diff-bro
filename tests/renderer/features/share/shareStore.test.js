import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useShareStore } from '../../../../src/renderer/src/features/share'
import { useDiffStore } from '../../../../src/renderer/src/stores/diffStore'
import { useVaultStore } from '../../../../src/renderer/src/stores/vaultStore'

// shareTo had no unit test at all, and its untested branches are the ones where
// a user LOSES something: the localCopy split decides whether the sender is told
// they have no record of what they just sent, and the error map degrades every
// crypto verdict to a generic string when a key is missing from it.
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

const notices = () => useDiffStore().notice

describe('shareStore.shareTo', () => {
  it('reports where the sealed file went', async () => {
    const share = useShareStore()
    const vault = useVaultStore()
    vault.share = vi.fn().mockResolvedValue({ ok: true, to: 'Ada', path: '/tmp/a.diffbro' })
    share.shareEntryId = 'entry-1'

    await share.shareTo(['fp-ada'])
    expect(vault.share).toHaveBeenCalledWith('entry-1', ['fp-ada'])
    expect(notices()).toContain('/tmp/a.diffbro')
    expect(notices()).not.toMatch(/could not be saved/)
  })

  // The sealed file went out either way; only the sender's own twin failed, and
  // not saying so leaves them believing they have a copy they do not have.
  it('says so when the local copy could not be saved', async () => {
    const share = useShareStore()
    const vault = useVaultStore()
    vault.shareDraft = vi
      .fn()
      .mockResolvedValue({ ok: true, to: 'Ada', path: '/tmp/a.diffbro', localCopy: false })
    share.shareDraft = { name: 'draft' }

    await share.shareTo(['fp-ada'])
    expect(notices()).toMatch(/could not be saved/)
    expect(notices()).toMatch(/not in your saved list/)
  })

  it('maps a known crypto verdict to its own wording', async () => {
    const share = useShareStore()
    const vault = useVaultStore()
    vault.share = vi.fn().mockResolvedValue({ error: 'expired' })
    share.shareEntryId = 'entry-1'

    await share.shareTo(['fp-ada'])
    expect(notices()).toBeTruthy()
    expect(notices()).not.toBe('Sharing failed.')
  })

  it('still says something for an error code it does not know', async () => {
    const share = useShareStore()
    const vault = useVaultStore()
    vault.share = vi.fn().mockResolvedValue({ error: 'some-new-code' })
    share.shareEntryId = 'entry-1'

    await share.shareTo(['fp-ada'])
    expect(notices()).toBe('Sharing failed.')
  })

  it('does nothing without a recipient', async () => {
    const share = useShareStore()
    const vault = useVaultStore()
    vault.share = vi.fn()
    await share.shareTo([])
    expect(vault.share).not.toHaveBeenCalled()
  })

  // A reactive array is a Proxy, which structured clone refuses at the IPC
  // boundary — the unwrap is why this is a plain array by the time it leaves.
  it('hands the recipient list over as a plain array', async () => {
    const share = useShareStore()
    const vault = useVaultStore()
    vault.share = vi.fn().mockResolvedValue({ ok: true, to: 'Ada', path: '/tmp/a' })
    share.shareEntryId = 'entry-1'

    await share.shareTo(['a', 'b'])
    const [, arg] = vault.share.mock.calls[0]
    expect(Array.isArray(arg)).toBe(true)
    expect(arg).toEqual(['a', 'b'])
  })
})

// The email half of the key swap: an unaddressed draft with the key file on
// the clipboard, degrading like the diff hand-off does.
describe('shareStore.runEmailKey', () => {
  it('hands off and reports where the key went', async () => {
    window.api = {
      emailKey: vi.fn().mockResolvedValue({ ok: true, name: 'Ana.diffbrokey', copied: true })
    }
    const share = useShareStore()
    share.showShareKeyDialog = true
    await share.runEmailKey('Ana laptop')
    expect(window.api.emailKey).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Ana laptop' })
    )
    expect(share.showShareKeyDialog).toBe(false)
    expect(notices()).toMatch(/clipboard/i)
  })

  it('says the file survived when no mail app answered', async () => {
    window.api = {
      emailKey: vi.fn().mockResolvedValue({ error: 'no-mail-app', name: 'k.diffbrokey' })
    }
    const share = useShareStore()
    await share.runEmailKey('x')
    expect(notices()).toMatch(/mail app/i)
    expect(share.showShareKeyDialog).toBe(false)
  })

  it('a cancel leaves the dialog open and says nothing', async () => {
    window.api = { emailKey: vi.fn().mockResolvedValue({ canceled: true, path: '/tmp/k' }) }
    const share = useShareStore()
    share.showShareKeyDialog = true
    await share.runEmailKey('x')
    expect(share.showShareKeyDialog).toBe(true)
    expect(notices()).toBeNull()
  })
})

// The clipboard peek: a key copied out of a chat app lands in the SAME naming
// dialog a picked file does — offered, never silently added.
describe('shareStore.addTrustedKey — clipboard peek', () => {
  it('a clipboard key opens the confirm dialog marked with its source', async () => {
    window.api = {
      peekClipboardKey: vi.fn().mockResolvedValue({
        ok: true,
        key: { sign: 's', box: 'b', format: 'f' },
        fingerprint: 'fp99',
        defaultLabel: 'Rūta',
        vouchedBy: null
      }),
      addTrustedKey: vi.fn()
    }
    const share = useShareStore()
    await share.addTrustedKey()
    expect(share.pendingTrustedKey).toMatchObject({
      fingerprint: 'fp99',
      label: 'Rūta',
      source: 'clipboard'
    })
    expect(window.api.addTrustedKey).not.toHaveBeenCalled()
  })

  it('junk on the clipboard falls through to the file picker silently', async () => {
    window.api = {
      peekClipboardKey: vi.fn().mockResolvedValue({ error: 'no-key' }),
      addTrustedKey: vi.fn().mockResolvedValue({ canceled: true })
    }
    const share = useShareStore()
    await share.addTrustedKey()
    expect(window.api.addTrustedKey).toHaveBeenCalled()
    expect(share.pendingTrustedKey).toBeNull()
  })

  it('your own key on the clipboard falls through too — you just copied it to send', async () => {
    window.api = {
      peekClipboardKey: vi.fn().mockResolvedValue({ error: 'own-key' }),
      addTrustedKey: vi.fn().mockResolvedValue({ canceled: true })
    }
    const share = useShareStore()
    await share.addTrustedKey()
    expect(window.api.addTrustedKey).toHaveBeenCalled()
  })

  it('skipPeek goes straight to the picker — the "Choose a file instead" path', async () => {
    window.api = {
      peekClipboardKey: vi.fn(),
      addTrustedKey: vi.fn().mockResolvedValue({ canceled: true })
    }
    const share = useShareStore()
    await share.addTrustedKey({ skipPeek: true })
    expect(window.api.peekClipboardKey).not.toHaveBeenCalled()
    expect(window.api.addTrustedKey).toHaveBeenCalled()
  })
})
