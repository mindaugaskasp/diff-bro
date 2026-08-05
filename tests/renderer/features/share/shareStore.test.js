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
