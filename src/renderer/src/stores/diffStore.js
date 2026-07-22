import { toRaw } from 'vue'
import { defineStore } from 'pinia'
import { resolveAdapter } from '../adapters'
import { useVaultStore } from './vaultStore'
import { useSnippetStore } from './snippetStore'
import { detectTextFormat, formatJson, formatXml } from '../utils/textFormats'
import { loadPersisted, savePersisted } from '../persist'

const SHARE_ERRORS = {
  'not-a-share-file': 'That file is not a Diff Bro shared diff.',
  'not-for-you':
    'This shared diff is sealed for a different machine — it can only be opened by its addressed recipient.',
  tampered: 'Rejected: the file was modified in transit (or is corrupted) — decryption failed.',
  'unknown-signer':
    'Sealed correctly, but signed by an unknown sender — add their public key first (File → Add Trusted Key).',
  'bad-signature': 'Signature check failed — the file was modified or corrupted.',
  expired: 'This shared diff has already expired.',
  'invalid-ttl': 'Rejected: shared diffs cannot live longer than 24 hours.',
  'unknown-recipient': 'Recipient not found among trusted keys.',
  renamed:
    'This shared diff was renamed — its integrity is tied to its original hashed filename, so it was refused. Ask the sender to re-send it unchanged.',
  'identity-unavailable':
    'Your identity key couldn’t be unlocked (the OS keychain may be locked). Nothing was changed — unlock it and try again.',
  'vault-key-unavailable':
    'The saved-diff key couldn’t be unlocked (the OS keychain may be locked). Your saved diffs and snippets are intact — unlock it and try again.'
}

let noticeTimer = null

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}

// Format-suggestion banner: null once dismissed for the *current* content
// (dismissedContent tracks the exact string that was dismissed, so editing
// or re-loading the side clears the dismissal), null once already pretty.
function formatHintFor(file, dismissedContent) {
  if (!file?.content || file.content === dismissedContent) return null
  const detected = detectTextFormat(file.content)
  if (!detected) return null
  if (!detected.valid) return detected // carries kind, error, and line/column when known
  const pretty = detected.kind === 'json' ? formatJson(file.content) : formatXml(file.content)
  if (pretty.trim() === file.content.trim()) return null // already pretty
  return { kind: detected.kind, valid: true }
}

// Menu action → what it does to the store. A table rather than a switch: the
// accelerators in src/main/menu.js and MenuBar.vue name these strings, so this
// is the single list of everything a menu can trigger.
const MENU_ACTIONS = {
  'open-left': (s) => s.pick('left'),
  'open-right': (s) => s.pick('right'),
  save: (s) => {
    if (s.canSave) s.showSaveDialog = true
  },
  'share-current': (s) => s.shareCurrent(),
  swap: (s) => s.swap(),
  clear: (s) => s.clear(),
  'toggle-paste': (s) => s.togglePasteMode(),
  'toggle-split': (s) => (s.renderSideBySide = !s.renderSideBySide),
  'toggle-theme': (s) => s.toggleTheme(),
  'import-shared': (s) => s.importShared(),
  'export-pubkey': (s) => (s.showShareKeyDialog = true),
  'copy-pubkey': (s) => (s.showShareKeyDialog = true),
  'add-trusted-key': (s) => s.addTrustedKey(),
  'manage-keys': (s) => (s.showTrustedKeysDialog = true),
  'config-backup': (s) => (s.configMode = 'backup'),
  'config-restore': (s) => (s.configMode = 'restore'),
  settings: (s) => (s.showSettingsDialog = true),
  'tools-base64': (s) => (s.showBase64Dialog = true),
  'tools-json': (s) => (s.textTool = 'json'),
  'tools-xml': (s) => (s.textTool = 'xml'),
  'tools-sql': (s) => (s.textTool = 'sql'),
  'tools-crypt': (s) => (s.showCryptDialog = true),
  shortcuts: (s) => (s.showShortcutsDialog = true)
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
    // Dropped file paths waiting on the "replace current diff?" confirmation
    // (a drop that would discard a complete, already-loaded comparison) — null
    // when no prompt is open. `replaceAfterSave` carries them through the save
    // dialog when the user chooses "Save first".
    pendingReplace: null,
    replaceAfterSave: null,
    // Persisted through the durable data-dir store (persist.js), same as vault
    // and snippets, so the choice survives a reinstall that wipes userData; the
    // old localStorage 'diffbro.theme' key is migrated forward automatically.
    theme: loadPersisted('theme') === 'light' ? 'light' : 'dark',
    // entry id currently in the share dialog (null = closed)
    shareEntryId: null,
    // { key, fingerprint, label } while the drag-drop "name this trusted
    // key" dialog is open — null otherwise.
    pendingTrustedKey: null,
    // Trusted-keys management dialog visibility.
    showTrustedKeysDialog: false,
    // "Share my public key" dialog visibility (name + export/copy your key).
    showShareKeyDialog: false,
    // Config backup/restore passphrase dialog: 'backup' | 'restore' | null.
    configMode: null,
    // Tools menu dialog visibility.
    showBase64Dialog: false,
    // Which format/validate tool is open ('json' | 'xml' | 'sql'), null when
    // none — one dialog serves all of them (see utils/textTools.js).
    textTool: null,
    showCryptDialog: false,
    // Settings dialog (data location) visibility.
    showSettingsDialog: false,
    // Help → Keyboard Shortcuts dialog visibility.
    showShortcutsDialog: false,
    // Mermaid diagram viewer: { name, code } while open, null when closed.
    mermaidView: null,
    // content string last dismissed per side, so the format-hint banner
    // stays gone until that side's content actually changes.
    dismissedFormatHint: { left: null, right: null }
  }),
  getters: {
    ready: (s) => !!s.left && !!s.right,
    // A diff is saveable once there is anything to keep: two loaded files,
    // or text typed/pasted into the paste panes (even before Compare).
    canSave: (s) => (s.mode === 'paste' ? !!(s.pasteLeft || s.pasteRight) : s.ready),
    leftComparable: (s) => (s.left ? resolveAdapter(s.left).toComparable(s.left) : null),
    rightComparable: (s) => (s.right ? resolveAdapter(s.right).toComparable(s.right) : null),
    leftFormatHint: (s) => formatHintFor(s.left, s.dismissedFormatHint.left),
    rightFormatHint: (s) => formatHintFor(s.right, s.dismissedFormatHint.right)
  },
  actions: {
    async pick(side) {
      const file = await window.api.openFile(side)
      this.receive(side, file)
    },
    async drop(side, path) {
      this.receive(side, await window.api.readFile(path))
    },
    // Files dropped on the window. `targetSide` is set when the drop landed
    // directly on one of the two file slots.
    //   - 2+ files: fill both sides in drop order (replacing whatever's there).
    //   - 1 file onto a specific slot: fill that slot.
    //   - 1 file elsewhere while a comparison is already loaded: start over —
    //     clear both sides, put the file on the left, and wait for the next
    //     one (so a "third" dropped file begins a fresh comparison).
    //   - 1 file otherwise: fill the first empty side (left, then right).
    async dropFiles(paths, targetSide = null) {
      if (!paths.length) return
      // Dropping on a specific slot is a deliberate single-side change.
      if (targetSide && paths.length === 1) {
        await this.drop(targetSide, paths[0])
        return
      }
      // Would this discard a complete comparison? Ask first, rather than
      // silently replacing it.
      if (this.left && this.right) {
        this.pendingReplace = paths.slice(0, 2)
        return
      }
      if (paths.length >= 2) {
        await this.drop('left', paths[0])
        await this.drop('right', paths[1])
        return
      }
      // First file of a new comparison — load it and wait for the second.
      await this.drop(!this.left ? 'left' : 'right', paths[0])
    },
    // Clear and load the replacement file(s). One file lands on the left and
    // waits for a second; two files fill both sides.
    async _loadReplacement(paths) {
      this.clear()
      await this.drop('left', paths[0])
      if (paths.length >= 2) await this.drop('right', paths[1])
    },
    async confirmReplace() {
      const paths = this.pendingReplace
      this.pendingReplace = null
      if (paths) await this._loadReplacement(paths)
    },
    // "Save first": keep the pending paths, open the save dialog; the save
    // dialog calls finishReplaceAfterSave() once the current diff is saved.
    saveThenReplace() {
      this.replaceAfterSave = this.pendingReplace
      this.pendingReplace = null
      this.showSaveDialog = true
    },
    async finishReplaceAfterSave() {
      const paths = this.replaceAfterSave
      this.replaceAfterSave = null
      if (paths) await this._loadReplacement(paths)
    },
    cancelReplace() {
      this.pendingReplace = null
    },
    receive(side, file) {
      if (!file) return // dialog cancelled or large-file load declined
      if (file.error === 'binary') {
        this.showNotice(
          `"${file.name}" looks like a binary file — only text files can be compared.`
        )
        return
      }
      // Any other error shape (e.g. a path main refused to serve) is not a
      // loadable file — never assign it to a side.
      if (file.error) return
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
    // Open the Mermaid viewer for a diagram's decrypted source.
    openMermaid(name, code) {
      this.mermaidView = { name, code }
    },
    closeMermaid() {
      this.mermaidView = null
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark'
      savePersisted('theme', this.theme)
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
    // Pretty-print `side` in place using whichever format its hint detected.
    formatSide(side) {
      const file = this[side]
      const hint = side === 'left' ? this.leftFormatHint : this.rightFormatHint
      if (!file || !hint?.valid) return
      const pretty = hint.kind === 'json' ? formatJson(file.content) : formatXml(file.content)
      this[side] = { ...file, content: pretty }
    },
    dismissFormatHint(side) {
      this.dismissedFormatHint[side] = this[side]?.content ?? null
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
      // Also wipe paste-mode text so a cleared session never leaves the
      // previous pasted content lingering behind.
      this.pasteLeft = ''
      this.pasteRight = ''
    },
    showNotice(text) {
      this.notice = text
      clearTimeout(noticeTimer)
      noticeTimer = setTimeout(() => (this.notice = null), 5000)
    },
    handleMenuAction(action) {
      MENU_ACTIONS[action]?.(this)
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
    // Export / copy THIS install's public key, tagged with the display name
    // the user typed so recipients recognize it. Called by ShareKeyDialog.
    async runExportKey(label) {
      const res = await window.api.exportPublicKey(label)
      if (res.ok) {
        this.showShareKeyDialog = false
        this.showNotice(
          `Your public key was saved. Send this file to the other person — they import it. To receive their diffs, import THEIR key (Security → Add Trusted Key).`
        )
      }
    },
    async runCopyKey(label) {
      const res = await window.api.copyPublicKey(label)
      if (res.ok) {
        this.showShareKeyDialog = false
        this.showNotice(
          `Your public key was copied. Send it to the other person — they import it. To receive their diffs, import THEIR key.`
        )
      }
    },
    // Pick a key file via dialog, then require a name before adding (same
    // naming dialog as the drag-drop path).
    async addTrustedKey() {
      const res = await window.api.addTrustedKey()
      if (res.ok) {
        this.pendingTrustedKey = {
          key: res.key,
          fingerprint: res.fingerprint,
          label: res.defaultLabel
        }
      } else if (res.error === 'own-key') {
        this.showNotice("That's your own public key — you don't need to trust yourself.")
      } else if (res.error) {
        this.showNotice('That file is not a valid public key.')
      }
    },
    // A .diffbrokey dropped onto the window: validate it, then open the
    // naming dialog so the user can label the trusted host before adding.
    async receiveDroppedKey(path) {
      const res = await window.api.readKeyFile(path)
      if (res.ok) {
        this.pendingTrustedKey = {
          key: res.key,
          fingerprint: res.fingerprint,
          label: res.defaultLabel
        }
      } else if (res.error === 'own-key') {
        this.showNotice("That's your own public key — you don't need to trust yourself.")
      } else {
        this.showNotice('That file is not a valid Diff Bro public key.')
      }
    },
    async confirmTrustedKey(label) {
      const pending = this.pendingTrustedKey
      if (!pending) return
      // toRaw: the pending key lives in reactive state, and a Proxy can't cross
      // the structured-clone boundary — sending one rejects the IPC call.
      let res
      try {
        res = await window.api.addTrustedKeyNamed(toRaw(pending.key), label)
      } catch {
        res = { error: 'ipc' }
      }
      // Cleared only once the key is actually stored: TrustedKeysDialog re-reads
      // the list when this goes null, and clearing first raced the write — the
      // manager came back without the key that had just been added.
      this.pendingTrustedKey = null
      if (res.ok) {
        this.showNotice(`Now trusting "${res.label}" (${res.fingerprint}).`)
        // Land in the manager: the new key is visible next to the existing ones,
        // with rename and remove at hand.
        this.showTrustedKeysDialog = true
      } else this.showNotice('Could not add that key.')
    },
    cancelTrustedKey() {
      this.pendingTrustedKey = null
    },
    // --- configuration backup / restore ---
    async runConfigBackup(passphrase) {
      const snippets = await useSnippetStore().fullBundle()
      const settings = { theme: this.theme }
      const res = await window.api.backupConfig(snippets, settings, passphrase)
      if (res.ok) this.showNotice(`Configuration backed up to ${res.path}`)
      else if (!res.canceled) this.showNotice('Backup failed.')
    },
    async runConfigRestore(passphrase) {
      const res = await window.api.restoreConfig(passphrase)
      if (res.ok) {
        if (res.snippets) await useSnippetStore().restoreBundle(res.snippets)
        if (res.settings?.theme && res.settings.theme !== this.theme) this.toggleTheme()
        this.showNotice('Configuration restored — identity keys and trusted hosts are updated.')
      } else if (res.error === 'wrong-passphrase') {
        this.showNotice('Wrong passphrase, or the file is corrupted.')
      } else if (res.error) {
        this.showNotice('That file is not a Diff Bro configuration backup.')
      }
    }
  }
})
