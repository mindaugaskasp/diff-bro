// The key swap's actions, spread into shareStore (its own module: the store
// sits near its size cap). Both halves land in the SAME naming/confirm dialog
// — a key is never trusted without it, whatever surface it arrived through.
import { useDiffStore } from '../../stores/diffStore'
import { useEmailStore } from '../email'
import { t } from '../../i18n'
import { MAX_KEY_NAME } from '../../../../shared/keyName'

const KEY_NAME_NOTICES = {
  'name-too-long': () => t('shareNotices.keyNameTooLong', { max: MAX_KEY_NAME }),
  'name-taken': () => t('shareNotices.keyNameTaken'),
  'name-empty': () => t('keyName.empty')
}

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

  /** @returns {boolean} whether the error was about the key's name, and said */
  noticeKeyName(error) {
    const notice = KEY_NAME_NOTICES[error]
    if (notice) useDiffStore().showNotice(notice())
    return !!notice
  },

  // Asked for outright, so a miss is said aloud rather than opening a file picker.
  async pasteTrustedKey() {
    const peeked = await window.api.peekClipboardKey()
    if (peeked?.ok) {
      this.pendingTrustedKey = pendingFrom(peeked, 'clipboard')
      return
    }
    const diff = useDiffStore()
    if (peeked?.error === 'own-key') diff.showNotice(t('shareNotices.thatsYourOwnKey'))
    else if (!this.noticeKeyName(peeked?.error)) diff.showNotice(t('shareNotices.noKeyOnClipboard'))
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
    } else if (this.noticeKeyName(res.error)) {
      return
    } else if (res.error) {
      diff.showNotice(t('shareNotices.thatFileIsNotA'))
    }
  }
}
