// The key swap's actions, spread into shareStore (its own module: the store
// sits near its size cap). Both halves land in the SAME naming/confirm dialog
// — a key is never trusted without it, whatever surface it arrived through.
import { useDiffStore } from '../../stores/diffStore'
import { useEmailStore } from '../email'
import { t } from '../../i18n'

const pendingFrom = (res, source) => ({
  key: res.key,
  fingerprint: res.fingerprint,
  label: res.defaultLabel,
  vouchedBy: res.vouchedBy ?? null,
  ...(source ? { source } : {})
})

export const keyExchangeActions = {
  // Email my key out: main stages the file, puts it on the clipboard, opens an
  // UNADDRESSED draft. A cancel keeps the dialog open — nothing happened.
  async runEmailKey(label) {
    const diff = useDiffStore()
    const res = await window.api.emailKey({
      label,
      reveal: useEmailStore().revealAfterCreate
    })
    if (res?.canceled) return
    this.showShareKeyDialog = false
    if (res?.ok) diff.showNotice(t('shareNotices.keyEmailOpened'))
    else if (res?.error === 'no-mail-app') diff.showNotice(t('shareNotices.keyEmailNoMailApp'))
    else if (res?.error) diff.showNotice(t('shareNotices.keyEmailFailed'))
  },

  // Pick a key, clipboard first: a key copied out of a chat app is offered —
  // through the same confirm — before the file picker opens. Every peek miss
  // (junk, empty, your OWN key just copied to send) falls through silently.
  async addTrustedKey({ skipPeek = false } = {}) {
    const diff = useDiffStore()
    const peeked = skipPeek ? null : await window.api.peekClipboardKey()
    if (peeked?.ok) {
      this.pendingTrustedKey = pendingFrom(peeked, 'clipboard')
      return
    }
    const res = await window.api.addTrustedKey()
    if (res.ok) {
      this.pendingTrustedKey = pendingFrom(res)
    } else if (res.error === 'own-key') {
      diff.showNotice(t('shareNotices.thatsYourOwnKey'))
    } else if (res.error) {
      diff.showNotice(t('shareNotices.thatFileIsNotA'))
    }
  }
}
