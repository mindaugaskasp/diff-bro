import { toRaw } from 'vue'
import { useDiffStore } from '../../stores/diffStore'
import { useVaultStore } from '../../stores/vaultStore'
import { t } from '../../i18n'

async function diffEntry(store) {
  const vault = useVaultStore()
  if (store.shareDraft) return vault.draftEntry(store.shareDraft)
  return store.shareEntryId ? vault.entryForShare(store.shareEntryId) : null
}

async function requestFor(store) {
  if (store.shareSnippet) return { snippet: { ...toRaw(store.shareSnippet) } }
  const entry = await diffEntry(store)
  return entry ? { diff: JSON.parse(JSON.stringify(entry)) } : null
}

export const lanSendActions = {
  openSnippetShare(snippet) {
    this.shareSnippet = snippet
  },
  async sendTo(recipientFps) {
    const fps = [...recipientFps].filter(Boolean)
    const request = fps.length ? await requestFor(this) : null
    if (!request) return
    this.sending = true
    const res = await window.api.lanSend({ ...request, fps })
    this.sending = false
    if (res?.failed?.length) {
      this.sendFailure = {
        names: res.failed.map((f) => f.name),
        fps,
        snippet: !!this.shareSnippet,
        draft: this.shareDraft,
        entryId: this.shareEntryId
      }
    } else if (!res?.ok) {
      return useDiffStore().showNotice(t('lan.share.failed'))
    }
    if (res.sent?.length)
      useDiffStore().showNotice(t('lan.share.sent', { names: res.sent.join(', ') }))
    this.dismissShare()
  },
  createFileAfterFailure() {
    const failure = this.sendFailure
    this.sendFailure = null
    this.shareDraft = failure.draft
    this.shareEntryId = failure.entryId
    return this.shareTo(failure.fps)
  },
  closeSendFailure() {
    this.sendFailure = null
  }
}
