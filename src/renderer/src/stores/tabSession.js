// Reading and writing the stored session, spread into tabsStore. Its own module
// because it is one concern — what survives a quit — with its own crypto and
// budget rules, and the store it lives in is at its cap.
//
// `_notice` rather than useDiffStore(): reaching diffStore from here would
// close an import cycle back through tabsStore.
import { useSettingsStore } from './settingsStore'
import { loadPersisted, savePersisted } from '../persist'
import {
  EMPTY_ENVELOPE,
  SESSION_AAD,
  SESSION_VERSION,
  packSession,
  readEnvelope,
  readSession
} from '../utils/session'
import { droppedTabsNotice } from '../utils/tabNotices'
import { tabFromStored } from '../utils/session'

export const sessionActions = {
  /**
   * Write the open comparisons out, so closing the app is not a loss. Sealed
   * with the vault key (never plaintext: this is the file contents you were
   * reading). Called on a debounce — see useSessionPersistence.
   */
  async saveSession() {
    // sessionReady: nothing may be written before the stored session has been
    // read back — the debounce races the restore, and a file dropped inside
    // that window used to overwrite every other comparison with the one just
    // opened.
    const usable =
      useSettingsStore().restoreSession &&
      typeof window.api?.vaultEncrypt === 'function' &&
      this.sessionReady
    if (!usable) return
    const packed = packSession(this.tabs, this.activeId, this._liveDoc())
    // A locked keychain is temporary; the comparisons behind it are not ours
    // to throw away.
    if (!packed) return savePersisted('session', EMPTY_ENVELOPE)
    this._reportDropped(packed.dropped)
    const box = await window.api.vaultEncrypt(JSON.stringify(packed), SESSION_AAD)
    if (box?.error) return
    savePersisted(
      'session',
      JSON.stringify({ version: SESSION_VERSION, iv: box.iv, data: box.data })
    )
  },
  _reportDropped(count) {
    if (count === this.sessionDropped) return
    this.sessionDropped = count
    if (count) this._notice(droppedTabsNotice(count))
  },
  /** Reopen last session's comparisons, replacing the blank tab init() made.
   * Runs before the window accepts anything else, so nothing it restores can
   * land on top of a diff the user already asked for.
   * @returns {Promise<number>} how many tabs came back */
  async restoreSession() {
    if (!useSettingsStore().restoreSession) return 0
    const box = readEnvelope(loadPersisted('session'))
    if (!box || typeof window.api?.vaultDecrypt !== 'function') {
      this.sessionReady = true
      return 0
    }
    const plaintext = await window.api.vaultDecrypt(box, SESSION_AAD)
    // An { error } is the KEY, not the file: keep the session for a launch
    // where the keychain is open rather than overwriting it with nothing.
    if (plaintext && typeof plaintext === 'object') return 0
    this.sessionReady = true
    const session = readSession(plaintext)
    if (!session) return 0
    this._restoreTabs(session)
    return session.tabs.length
  },
  /**
   * Settings → Storage. Turning it off forgets what is already stored:
   * leaving the last comparisons on disk after "don't reopen them" would be a
   * promise only half kept.
   * @param {boolean} on
   */
  setRestoreSession(on) {
    useSettingsStore().setRestoreSession(on)
    if (!on) savePersisted('session', EMPTY_ENVELOPE)
  },
  _restoreTabs(session) {
    this.tabs = session.tabs.map(tabFromStored)
    this._show(this.tabs[session.tabs.findIndex((t) => t.active)] ?? this.tabs[0])
  }
}
