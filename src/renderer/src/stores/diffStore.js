import { defineStore } from 'pinia'
import { resolveAdapter } from '../adapters'
import { useVaultStore } from './vaultStore'

const SHARE_ERRORS = {
  'not-a-share-file': 'That file is not a DiffBro shared diff.',
  'not-for-you':
    'This shared diff is sealed for a different machine — it can only be opened by its addressed recipient.',
  tampered: 'Rejected: the file was modified in transit (or is corrupted) — decryption failed.',
  'unknown-signer':
    'Sealed correctly, but signed by an unknown sender — add their public key first (File → Add Trusted Key).',
  'bad-signature': 'Signature check failed — the file was modified or corrupted.',
  expired: 'This shared diff has already expired.',
  'invalid-ttl': 'Rejected: shared diffs cannot live longer than 24 hours.',
  'unknown-recipient': 'Recipient not found among trusted keys.'
}

let noticeTimer = null

const THEME_KEY = 'diffbro.theme'

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}

export const useDiffStore = defineStore('diff', {
  state: () => ({
    left: null, // { path, name, content, encoding, size }
    right: null,
    renderSideBySide: true,
    ignoreTrimWhitespace: false,
    // 'files' shows the diff viewer, 'paste' shows the two-textarea input.
    mode: 'files',
    pasteLeft: '',
    pasteRight: '',
    // { additions, deletions } from the diff editor, null before first diff
    stats: null,
    // transient user-facing message (binary file rejected, etc.)
    notice: null,
    // save-diff dialog visibility
    showSaveDialog: false,
    // when true, the save dialog flows straight into the share dialog
    saveThenShare: false,
    theme: localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark',
    // entry id currently in the share dialog (null = closed)
    shareEntryId: null
  }),
  getters: {
    ready: (s) => !!s.left && !!s.right,
    // A diff is saveable once there is anything to keep: two loaded files,
    // or text typed/pasted into the paste panes (even before Compare).
    canSave: (s) => (s.mode === 'paste' ? !!(s.pasteLeft || s.pasteRight) : s.ready),
    leftComparable: (s) => (s.left ? resolveAdapter(s.left).toComparable(s.left) : null),
    rightComparable: (s) => (s.right ? resolveAdapter(s.right).toComparable(s.right) : null)
  },
  actions: {
    async pick(side) {
      const file = await window.api.openFile(side)
      this.receive(side, file)
    },
    async drop(side, path) {
      this.receive(side, await window.api.readFile(path))
    },
    receive(side, file) {
      if (!file) return // dialog cancelled or large-file load declined
      if (file.error === 'binary') {
        this.showNotice(
          `"${file.name}" looks like a binary file — only text files can be compared.`
        )
        return
      }
      this[side] = file
      this.mode = 'files'
    },
    comparePasted() {
      this.left = { path: null, name: 'Left (pasted)', content: this.pasteLeft }
      this.right = { path: null, name: 'Right (pasted)', content: this.pasteRight }
      this.mode = 'files'
    },
    togglePasteMode() {
      this.mode = this.mode === 'paste' ? 'files' : 'paste'
    },
    initTheme() {
      applyTheme(this.theme)
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, this.theme)
      applyTheme(this.theme)
    },
    // Re-read both sides from disk (quietly — no large-file prompt) so the
    // diff follows external edits. Called when the window regains focus.
    async refreshFromDisk() {
      for (const side of ['left', 'right']) {
        const path = this[side]?.path
        if (!path) continue
        try {
          const file = await window.api.readFile(path, { quiet: true })
          if (file && !file.error && file.content !== this[side].content) {
            this[side] = file
            this.showNotice(`"${file.name}" changed on disk — diff reloaded.`)
          }
        } catch {
          // File gone or unreadable now; keep showing the last loaded state.
        }
      }
    },
    swap() {
      ;[this.left, this.right] = [this.right, this.left]
    },
    // Snapshot of everything a saved diff needs to be restored later —
    // including in-progress paste-mode text.
    snapshot() {
      return {
        mode: this.mode,
        left: this.left,
        right: this.right,
        pasteLeft: this.pasteLeft,
        pasteRight: this.pasteRight,
        renderSideBySide: this.renderSideBySide,
        ignoreTrimWhitespace: this.ignoreTrimWhitespace
      }
    },
    restore(payload) {
      this.left = payload.left
      this.right = payload.right
      this.pasteLeft = payload.pasteLeft ?? ''
      this.pasteRight = payload.pasteRight ?? ''
      this.renderSideBySide = payload.renderSideBySide ?? true
      this.ignoreTrimWhitespace = payload.ignoreTrimWhitespace ?? false
      this.mode = payload.mode ?? 'files'
    },
    clear() {
      this.left = null
      this.right = null
      this.stats = null
    },
    showNotice(text) {
      this.notice = text
      clearTimeout(noticeTimer)
      noticeTimer = setTimeout(() => (this.notice = null), 5000)
    },
    handleMenuAction(action) {
      switch (action) {
        case 'open-left':
          return this.pick('left')
        case 'open-right':
          return this.pick('right')
        case 'save':
          if (this.canSave) this.showSaveDialog = true
          return
        case 'share-current':
          return this.shareCurrent()
        case 'swap':
          return this.swap()
        case 'clear':
          return this.clear()
        case 'toggle-paste':
          return this.togglePasteMode()
        case 'toggle-split':
          this.renderSideBySide = !this.renderSideBySide
          return
        case 'toggle-theme':
          return this.toggleTheme()
        case 'import-shared':
          return this.importShared()
        case 'export-pubkey':
          return this.exportPublicKey()
        case 'add-trusted-key':
          return this.addTrustedKey()
      }
    },
    // One-click share of whatever is on screen: save first (a share file
    // needs a name and an expiry), then flow straight into the recipient
    // picker. The share dialog itself handles first-time key setup.
    shareCurrent() {
      if (!this.canSave) {
        this.showNotice('Nothing to share yet — load two files or paste some text first.')
        return
      }
      this.saveThenShare = true
      this.showSaveDialog = true
    },
    // Opens the recipient picker (a share file is sealed for one recipient).
    // With no trusted keys yet, the dialog walks through the one-time setup.
    shareEntry(id) {
      this.shareEntryId = id
    },
    async shareTo(recipientFp) {
      const id = this.shareEntryId
      this.shareEntryId = null
      const res = await useVaultStore().share(id, recipientFp)
      if (res.ok) this.showNotice(`Sealed shared diff for "${res.to}" written to ${res.path}`)
      else if (res.error) this.showNotice(SHARE_ERRORS[res.error] ?? 'Sharing failed.')
    },
    async importShared() {
      const res = await useVaultStore().importShared()
      if (res.ok)
        this.showNotice(
          `Imported "${res.entry.name}" from ${res.from} — same expiry as on the sender.`
        )
      else if (res.error) this.showNotice(SHARE_ERRORS[res.error] ?? 'Import failed.')
    },
    async exportPublicKey() {
      const res = await window.api.exportPublicKey()
      if (res.ok)
        this.showNotice(
          `Public key saved (fingerprint ${res.fingerprint}). Give this file to machines that should trust your shared diffs.`
        )
    },
    async addTrustedKey() {
      const res = await window.api.addTrustedKey()
      if (res.ok) this.showNotice(`Now trusting "${res.label}" (${res.fingerprint}).`)
      else if (res.error) this.showNotice('That file is not a valid public key.')
    }
  }
})
