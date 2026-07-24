import { toRaw } from 'vue'
import { defineStore } from 'pinia'
import { resolveAdapter } from '../adapters'
import { useVaultStore } from './vaultStore'
import { useSnippetStore } from './snippetStore'
import { detectTextFormat, formatJson, formatXml } from '../utils/textFormats'
import { toUnifiedDiff } from '../utils/unifiedDiff'
import { loadPersisted, savePersisted } from '../persist'
import { isDarkTheme, normalizeTheme, themeForDay } from '../utils/themes'
import { useSettingsStore } from './settingsStore'

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

// Merge the two per-side format hints into ONE banner so the diff never carries
// two stacked strips. Pure (takes the two hints, returns render data or null) so
// the store getter stays thin and this stays unit-testable.
function mergeFormatBanner(left, right) {
  const shown = []
  if (left) shown.push({ side: 'left', label: 'Left', hint: left })
  if (right) shown.push({ side: 'right', label: 'Right', hint: right })
  if (!shown.length) return null

  const kindLabel = (h) => (h.kind === 'json' ? 'JSON' : 'XML')
  const loc = (h) => (h.line ? ` at line ${h.line}, column ${h.column}` : '')
  const clause = ({ label, hint }) =>
    hint.valid
      ? `${label} looks like ${kindLabel(hint)} — pretty-print?`
      : `${label} looks like ${kindLabel(hint)} but doesn't parse${loc(hint)}${
          hint.error ? `: ${hint.error}` : ''
        }`

  const valid = shown.filter((x) => x.hint.valid)
  let message
  if (valid.length === 2) {
    message =
      left.kind === right.kind
        ? `Both sides look like ${kindLabel(left)} — pretty-print?`
        : 'Both sides look like structured data — pretty-print?'
  } else {
    message = shown.map(clause).join(' · ')
  }

  return {
    message,
    invalid: valid.length === 0, // red only when nothing here is actionable
    formatBoth: valid.length === 2,
    formatSide: valid.length === 1 ? valid[0].side : null,
    formatLabel: valid.length === 1 && shown.length === 2 ? `Format ${valid[0].label}` : 'Format',
    dismissSides: shown.map((x) => x.side)
  }
}

// A synthetic "pasted" comparison side — no path, so it's never re-read from
// disk on focus (unlike a real file slot).
function pastedSide(side, text) {
  return { path: null, name: `${side === 'left' ? 'Left' : 'Right'} (pasted)`, content: text }
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
  'copy-diff': (s) => s.copyDiff(),
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
    // In paste mode each side can instead hold a dropped/loaded file
    // ({ name, content }) — so pasted text on one side can be compared against a
    // real file on the other ("partial paste"). null = that side is a textarea.
    pasteLeftFile: null,
    pasteRightFile: null,
    // Ctrl/Cmd+V paste-to-compare flow: null | 'enter' | 'overwrite' controls
    // which confirmation is showing; pendingPasteText holds the clipboard text
    // between the "both sides full" confirm and the overwrite.
    pastePrompt: null,
    pendingPasteText: '',
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
    // Picked file (via Open / clicking a slot) waiting on the "replace current
    // diff?" confirmation, when it would overwrite a side of a complete, unsaved
    // comparison — { side, file }. `pickAfterSave` carries it through the save
    // dialog when the user chooses "Save first". null when no prompt is open.
    pendingPick: null,
    pickAfterSave: null,
    // True once the current comparison has been saved to the vault (or opened
    // from a saved diff) and not changed since — so overwriting it loses
    // nothing and the replace prompt is skipped. Any edit to either side clears
    // it (see receive/comparePasted/swap/formatSide).
    diffSaved: false,
    // The user's PERSISTED choice (Appearance picker), through the durable
    // data-dir store — survives a reinstall; the old localStorage 'diffbro.theme'
    // key migrates forward. Default Light; unknown ids normalize.
    userTheme: normalizeTheme(loadPersisted('theme')),
    // The ACTIVE, applied theme components read. Equals userTheme, unless the
    // "rotate daily" Fun option is on, when it's the day's random theme
    // (resolveActiveTheme). Kept separate so turning rotation off reverts cleanly.
    theme: normalizeTheme(loadPersisted('theme')),
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
    // Two loaded sides with a computed diff of no changes — surfaced as an
    // affirmative "identical" state so an empty +0/−0 doesn't read as "did it
    // run?". With Ignore-whitespace on, this also covers whitespace-only diffs.
    identical: (s) => !!s.left && !!s.right && s.stats?.additions === 0 && s.stats?.deletions === 0,
    // A diff is saveable once there is anything to keep: two loaded files,
    // or text/files put into the paste panes (even before Compare).
    canSave: (s) =>
      s.mode === 'paste'
        ? !!(s.pasteLeft || s.pasteRight || s.pasteLeftFile || s.pasteRightFile)
        : s.ready,
    leftComparable: (s) => (s.left ? resolveAdapter(s.left).toComparable(s.left) : null),
    rightComparable: (s) => (s.right ? resolveAdapter(s.right).toComparable(s.right) : null),
    // Which viewer the loaded comparison needs: 'text' (Monaco) or 'spreadsheet'
    // (grid). Text is the default so an empty/paste state routes to Monaco.
    comparableKind() {
      return this.leftComparable?.kind ?? this.rightComparable?.kind ?? 'text'
    },
    leftFormatHint: (s) => formatHintFor(s.left, s.dismissedFormatHint.left),
    rightFormatHint: (s) => formatHintFor(s.right, s.dismissedFormatHint.right),
    // One merged banner for both sides (see mergeFormatBanner) — null when neither
    // side has a pending hint.
    formatBanner() {
      return mergeFormatBanner(this.leftFormatHint, this.rightFormatHint)
    }
  },
  actions: {
    async pick(side) {
      const file = await window.api.openFile(side)
      if (!file) return // dialog cancelled
      // Replacing a side of a complete, unsaved comparison would discard it —
      // ask first. A saved comparison is safe to overwrite, so it skips the
      // prompt; a binary file falls through to receive(), which rejects it.
      if (this.ready && !this.diffSaved && !file.error) {
        this.pendingPick = { side, file }
        return
      }
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
      // Would this discard a complete comparison? Ask first — unless it's
      // already saved, in which case replacing it loses nothing.
      if (this.left && this.right) {
        if (!this.diffSaved) {
          this.pendingReplace = paths.slice(0, 2)
          return
        }
        await this._loadReplacement(paths.slice(0, 2))
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
    // --- file-load (Open / slot click) overwrite of an active comparison ---
    confirmPick() {
      const p = this.pendingPick
      this.pendingPick = null
      if (p) this.receive(p.side, p.file)
    },
    saveThenPick() {
      this.pickAfterSave = this.pendingPick
      this.pendingPick = null
      this.showSaveDialog = true
    },
    finishPickAfterSave() {
      const p = this.pickAfterSave
      this.pickAfterSave = null
      if (p) this.receive(p.side, p.file)
    },
    cancelPick() {
      this.pendingPick = null
    },
    // The current comparison now matches a vault entry (just saved, or opened
    // from a saved diff): overwriting it is safe, so the replace prompt is
    // skipped until the next edit.
    markSaved() {
      this.diffSaved = true
    },
    receive(side, file) {
      if (!file) return // dialog cancelled or large-file load declined
      if (file.error === 'binary') {
        this.showNotice(
          `"${file.name}" looks like a binary file — only text files can be compared.`
        )
        return
      }
      if (file.error === 'xlsx') {
        this.showNotice(`"${file.name}" could not be read as a spreadsheet — ${file.message}.`)
        return
      }
      // Any other error shape (e.g. a path main refused to serve) is not a
      // loadable file — never assign it to a side.
      if (file.error) return
      this[side] = file
      this.mode = 'files'
      // A newly loaded side is unsaved work again.
      this.diffSaved = false
    },
    comparePasted() {
      // Each side is whichever the user provided: a loaded file, else the
      // textarea's pasted text.
      const l = this.pasteLeftFile ?? { name: 'Left (pasted)', content: this.pasteLeft }
      const r = this.pasteRightFile ?? { name: 'Right (pasted)', content: this.pasteRight }
      this.left = { path: null, name: l.name, content: l.content }
      this.right = { path: null, name: r.name, content: r.content }
      this.mode = 'files'
      this.diffSaved = false
    },
    togglePasteMode() {
      this.mode = this.mode === 'paste' ? 'files' : 'paste'
    },
    // --- Ctrl/Cmd+V paste-to-compare (see usePasteShortcut) ---
    // Step 1: a paste gesture landed outside any input. Ask before touching the
    // clipboard — it's only read once the user confirms.
    requestPasteFromClipboard() {
      if (this.pastePrompt) return // a confirm is already up
      // A spreadsheet can't be diffed against pasted text — don't even prompt.
      if (this.left?.kind === 'spreadsheet' || this.right?.kind === 'spreadsheet') {
        this.showNotice('Paste-to-compare works with text, not a spreadsheet.')
        return
      }
      this.pastePrompt = 'enter'
    },
    // Step 2: confirmed. Read the clipboard (main process), enter paste mode, and
    // drop the text into the first empty side. If BOTH sides already hold text,
    // escalate to the overwrite confirm rather than clobbering unsaved work.
    async confirmPasteEnter() {
      const text = (await window.api?.readText?.()) ?? ''
      if (!text.trim()) {
        this.pastePrompt = null
        this.showNotice('The clipboard is empty — nothing to paste.')
        return
      }
      // With a comparison already loaded in files mode, paste relative to THAT
      // (fill the empty side, keeping the loaded file) — not the empty paste
      // textareas, which would orphan the loaded file.
      if (this.mode === 'files' && (this.left || this.right)) {
        this.pasteIntoComparison(text)
      } else {
        this.pasteIntoPasteFields(text)
      }
    },
    // Files mode with something loaded: drop the pasted text into the empty side
    // for an immediate diff; if both sides are full, confirm before overwriting.
    pasteIntoComparison(text) {
      if (this.left && this.right) {
        this.pendingPasteText = text
        this.pastePrompt = 'overwrite'
        return
      }
      const side = this.left ? 'right' : 'left'
      this[side] = pastedSide(side, text)
      this.diffSaved = false
      this.pastePrompt = null
    },
    // Empty state or already in paste mode: fill the first empty paste field.
    pasteIntoPasteFields(text) {
      this.mode = 'paste'
      const leftFull = !!(this.pasteLeft || this.pasteLeftFile)
      const rightFull = !!(this.pasteRight || this.pasteRightFile)
      if (!leftFull) {
        this.pasteLeft = text
        this.pastePrompt = null
      } else if (!rightFull) {
        this.pasteRight = text
        this.pastePrompt = null
      } else {
        this.pendingPasteText = text
        this.pastePrompt = 'overwrite'
      }
    },
    // Both sides were full and the user agreed to overwrite: replace the LEFT
    // side with the pasted text, keeping the right — in whichever mode.
    confirmPasteOverwrite() {
      const text = this.pendingPasteText
      this.pendingPasteText = ''
      this.pastePrompt = null
      if (this.mode === 'files') {
        this.left = pastedSide('left', text)
        this.diffSaved = false
      } else {
        this.pasteLeft = text
      }
    },
    cancelPaste() {
      this.pendingPasteText = ''
      this.pastePrompt = null
    },
    // Load a file into one paste side without leaving paste mode (partial
    // paste). `file` is a LoadedFile from the open dialog or a dropped file.
    receivePasteFile(side, file) {
      if (!file) return
      if (file.error === 'binary') {
        this.showNotice(
          `"${file.name}" looks like a binary file — only text files can be compared.`
        )
        return
      }
      if (file.kind === 'spreadsheet') {
        this.showNotice(`"${file.name}" is a spreadsheet — open it as a file comparison, not in paste mode.`)
        return
      }
      if (file.error) return
      // Keep the path so a partial-paste file follows external edits on focus
      // (refreshFromDisk), exactly like a loaded comparison side does.
      this[side === 'left' ? 'pasteLeftFile' : 'pasteRightFile'] = {
        name: file.name,
        content: file.content,
        path: file.path ?? null
      }
    },
    async pastePickFile(side) {
      this.receivePasteFile(side, await window.api.openFile(side))
    },
    clearPasteFile(side) {
      this[side === 'left' ? 'pasteLeftFile' : 'pasteRightFile'] = null
    },
    initTheme() {
      this.resolveActiveTheme()
    },
    // Compute and apply the active theme: the day's random theme when the "rotate
    // daily" Fun option is on, otherwise the user's saved choice. Idempotent —
    // safe to call on window focus so the theme rolls over at midnight.
    resolveActiveTheme() {
      const rotate = useSettingsStore().rotateThemeDaily
      this.theme = rotate ? themeForDay() : this.userTheme
      applyTheme(this.theme)
    },
    // Open the Mermaid viewer for a diagram's decrypted source.
    openMermaid(name, code) {
      this.mermaidView = { name, code }
    },
    closeMermaid() {
      this.mermaidView = null
    },
    // Select any of the named themes (Settings picker). Unknown ids fall back
    // to the default rather than leaving the app unstyled.
    setTheme(id) {
      this.userTheme = normalizeTheme(id)
      savePersisted('theme', this.userTheme)
      // While rotating, the pick is saved for later but the active theme stays
      // the day's; otherwise it applies immediately.
      this.resolveActiveTheme()
    },
    // Quick light/dark flip for the View menu + Ctrl+D: flips the ground, so a
    // dark-ground theme (Dark, Neon) goes Light and a light-ground one goes Dark.
    toggleTheme() {
      this.setTheme(isDarkTheme(this.userTheme) ? 'light' : 'dark')
    },
    // Re-read one slot quietly (no large-file prompt); returns the file name if
    // its on-disk content actually changed, else null. Paste-file slots keep
    // their trimmed { name, content, path } shape; comparison sides take the
    // full loaded-file object.
    async _reloadSlot(slot) {
      const current = this[slot]
      if (!current?.path) return null
      try {
        const file = await window.api.readFile(current.path, { quiet: true })
        if (!file || file.error || file.content === current.content) return null
        this[slot] = slot.startsWith('paste')
          ? { name: file.name, content: file.content, path: file.path }
          : file
        return file.name
      } catch {
        // File gone or unreadable now; keep showing the last loaded state.
        return null
      }
    },
    // Follow external edits when the window regains focus: both comparison
    // sides and either partial-paste source. One coalesced notice covers all of
    // them, so two files changing at once can't race the single toast timer.
    async refreshFromDisk() {
      const changed = []
      for (const slot of ['left', 'right', 'pasteLeftFile', 'pasteRightFile']) {
        const name = await this._reloadSlot(slot)
        if (name) changed.push(name)
      }
      if (changed.length === 1) {
        this.showNotice(`"${changed[0]}" changed on disk — diff reloaded.`)
      } else if (changed.length > 1) {
        this.showNotice(`${changed.length} files changed on disk — diff reloaded.`)
      }
    },
    // Copy the current comparison as a git-style unified diff (File → Copy diff,
    // toolbar, Ctrl+Shift+C). The on-screen diff is Monaco's; this recomputes a
    // patch that applies cleanly (see utils/unifiedDiff.js). Clipboard write goes
    // through the main process — navigator.clipboard is denied here (CLAUDE.md).
    async copyDiff() {
      if (!this.ready) {
        this.showNotice('Load two files (or compare pasted text) before copying a diff.')
        return
      }
      // A unified text patch can't represent a spreadsheet grid — its comparable
      // carries `sheets`, not `text`, so bail with a notice instead of feeding
      // `undefined` into the differ.
      if (this.comparableKind !== 'text') {
        this.showNotice('Copy diff is only available for text comparisons.')
        return
      }
      // ready guarantees both sides are loaded file objects with names.
      const res = toUnifiedDiff(this.leftComparable.text, this.rightComparable.text, {
        leftLabel: this.left.name,
        rightLabel: this.right.name
      })
      if (res.error === 'too-large')
        return this.showNotice('This diff is too large to copy as a patch.')
      if (!res.patch) return this.showNotice('The two sides are identical — nothing to copy.')
      const out = await window.api.copyText(res.patch)
      this.showNotice(out?.ok ? 'Unified diff copied to clipboard.' : 'Could not copy the diff.')
    },
    swap() {
      ;[this.left, this.right] = [this.right, this.left]
      // A swapped comparison no longer matches the saved snapshot's side order.
      this.diffSaved = false
    },
    // Pretty-print `side` in place using whichever format its hint detected.
    formatSide(side) {
      const file = this[side]
      const hint = side === 'left' ? this.leftFormatHint : this.rightFormatHint
      if (!file || !hint?.valid) return
      const pretty = hint.kind === 'json' ? formatJson(file.content) : formatXml(file.content)
      this[side] = { ...file, content: pretty }
      this.diffSaved = false
    },
    dismissFormatHint(side) {
      this.dismissedFormatHint[side] = this[side]?.content ?? null
    },
    // Format every side the merged banner offers (both are valid).
    formatBoth() {
      this.formatSide('left')
      this.formatSide('right')
    },
    // Dismiss the merged banner: silence each side it currently covers.
    dismissFormatHints(sides) {
      for (const side of sides) this.dismissFormatHint(side)
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
        pasteLeftFile: this.pasteLeftFile,
        pasteRightFile: this.pasteRightFile,
        renderSideBySide: this.renderSideBySide,
        ignoreTrimWhitespace: this.ignoreTrimWhitespace
      }
    },
    restore(payload) {
      this.left = payload.left
      this.right = payload.right
      this.pasteLeft = payload.pasteLeft ?? ''
      this.pasteRight = payload.pasteRight ?? ''
      this.pasteLeftFile = payload.pasteLeftFile ?? null
      this.pasteRightFile = payload.pasteRightFile ?? null
      this.renderSideBySide = payload.renderSideBySide ?? true
      this.ignoreTrimWhitespace = payload.ignoreTrimWhitespace ?? false
      this.mode = payload.mode ?? 'files'
      // Opened from a saved diff: it already exists in the vault, so replacing
      // it later needs no "you'll lose it" prompt.
      this.diffSaved = true
    },
    clear() {
      this.left = null
      this.right = null
      this.stats = null
      this.diffSaved = false
      // Also wipe paste-mode text and files so a cleared session never leaves
      // the previous content lingering behind.
      this.pasteLeft = ''
      this.pasteRight = ''
      this.pasteLeftFile = null
      this.pasteRightFile = null
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
      const settings = { theme: this.userTheme }
      const res = await window.api.backupConfig(snippets, settings, passphrase)
      if (res.ok) this.showNotice(`Configuration backed up to ${res.path}`)
      else if (!res.canceled) this.showNotice('Backup failed.')
    },
    async runConfigRestore(passphrase) {
      const res = await window.api.restoreConfig(passphrase)
      if (res.ok) {
        if (res.snippets) await useSnippetStore().restoreBundle(res.snippets)
        if (res.settings?.theme) this.setTheme(res.settings.theme)
        this.showNotice('Configuration restored — identity keys and trusted hosts are updated.')
      } else if (res.error === 'wrong-passphrase') {
        this.showNotice('Wrong passphrase, or the file is corrupted.')
      } else if (res.error) {
        this.showNotice('That file is not a Diff Bro configuration backup.')
      }
    }
  }
})
