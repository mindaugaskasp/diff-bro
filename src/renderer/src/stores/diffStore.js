import { toRaw } from 'vue'
import { defineStore } from 'pinia'
import { resolveAdapter } from '../adapters'
import { useVaultStore } from './vaultStore'
import { useSnippetStore } from './snippetStore'
import { detectTextFormat, formatJson, formatXml } from '../utils/textFormats'
import { applyUnifiedDiff, toUnifiedDiff } from '../utils/unifiedDiff'
import { diffToHtml } from '../utils/diffHtml'
import {
  afterFrames,
  captureRectOf,
  captureRegionOf,
  planSlices,
  untilChanged
} from '../utils/captureTarget'
import { getDiffScroller } from '../utils/diffScroller'
import { loadPersisted, savePersisted } from '../persist'
import { isDarkTheme, normalizeTheme, themeForDay } from '../utils/themes'
import { useSettingsStore } from './settingsStore'
import { useTabsStore } from './tabsStore'
import { isBlank } from '../utils/tabs'
import { TOOLS } from '../utils/tools'
import { sideName } from '../utils/pasteNames'

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

// null once dismissed for the current content, or once it's already pretty.
function formatHintFor(file, dismissedContent) {
  if (!file?.content || file.content === dismissedContent) return null
  const detected = detectTextFormat(file.content)
  if (!detected) return null
  if (!detected.valid) return detected // carries kind, error, and line/column when known
  const pretty = detected.kind === 'json' ? formatJson(file.content) : formatXml(file.content)
  if (pretty.trim() === file.content.trim()) return null // already pretty
  return { kind: detected.kind, valid: true }
}

// Merge the two per-side format hints into one banner. Pure + unit-tested.
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

// A pasted side has no path, so it's never re-read from disk on focus.
function pastedSide(side, text) {
  return { path: null, name: `${side === 'left' ? 'Left' : 'Right'} (pasted)`, content: text }
}

// The two compared sides as { name, content }, whether in files or paste mode.
function comparedSides(s) {
  if (s.mode === 'paste') {
    return [
      s.pasteLeftFile ?? { name: 'Left', content: s.pasteLeft },
      s.pasteRightFile ?? { name: 'Right', content: s.pasteRight }
    ]
  }
  return [s.left ?? { name: 'Left', content: '' }, s.right ?? { name: 'Right', content: '' }]
}

// Frames to let Monaco lay out and tokenize a restored diff before the shot.
const CAPTURE_FRAMES = 4
// Frames for a scrolled viewport to render its new lines between slices.
const SCROLL_FRAMES = 3

// Menu action → store effect. The single list of everything a menu can trigger
// (named by the accelerators in menu.js / MenuBar.vue).
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
  'apply-patch': (s) => s.applyPatch(),
  'export-html': (s) => s.exportDiff(),
  'export-image': (s) => s.exportCurrentImage(),
  'tab-new': () => useTabsStore().newTab(),
  'tab-next': () => useTabsStore().step(1),
  'tab-prev': () => useTabsStore().step(-1),
  'tab-close': (s) => s.requestActiveTabClose(),
  'import-snippets': (s) => s.importSnippets(),
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
  'command-palette': (s) => {
    s.paletteScope = 'all'
    s.showCommandPalette = true
  },
  'tools-base64': (s) => (s.textTool = 'base64'),
  'tools-json': (s) => (s.textTool = 'json'),
  'tools-xml': (s) => (s.textTool = 'xml'),
  'tools-uuid': (s) => (s.textTool = 'uuid'),
  'tools-jwt': (s) => (s.textTool = 'jwt'),
  'tools-epoch': (s) => (s.textTool = 'epoch'),
  'tools-url': (s) => (s.textTool = 'url'),
  'tools-lines': (s) => (s.textTool = 'lines'),
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
    // A paste side can instead hold a dropped file (partial paste); null = textarea.
    pasteLeftFile: null,
    pasteRightFile: null,
    // What to call each pasted side. Empty means "use the placeholder".
    pasteLeftName: '',
    pasteRightName: '',
    // Ctrl/Cmd+V flow: null | 'enter' | 'overwrite'; pendingPasteText holds the
    // clipboard text between confirm and overwrite.
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
    // Dropped paths / picked file awaiting the "replace current diff?" confirm;
    // the *AfterSave twins carry them through the save dialog on "Save first".
    pendingReplace: null,
    replaceAfterSave: null,
    pendingPick: null,
    pickAfterSave: null,
    // Saved (or opened from a saved diff) and unchanged since, so overwriting is
    // safe and skips the replace prompt. Any edit clears it.
    diffSaved: false,
    userTheme: normalizeTheme(loadPersisted('theme')), // persisted Appearance pick
    // The ACTIVE theme components read — userTheme, unless daily rotation is on.
    theme: normalizeTheme(loadPersisted('theme')),
    // entry id currently in the share dialog (an already-saved diff; null = closed)
    shareEntryId: null,
    // Pending share of the CURRENT diff, captured but NOT yet persisted:
    // { name, ttlHours, snapshot, tags }. The local copy is written only when the
    // share completes, so cancelling the picker/file dialog leaves nothing.
    shareDraft: null,
    pendingTrustedKey: null, // { key, fingerprint, label } while the name dialog is open
    // { fingerprint, label } while the "remove this key?" confirmation is open.
    pendingUntrust: null,
    // So the manager can highlight the just-added key; cleared when it closes.
    lastAddedTrustedFp: null,
    // Trusted-keys management dialog visibility.
    showTrustedKeysDialog: false,
    // "Share my public key" dialog visibility (name + export/copy your key).
    showShareKeyDialog: false,
    // Config backup/restore passphrase dialog: 'backup' | 'restore' | null.
    configMode: null,
    // Which tool panel is open (a registry id), null when none.
    textTool: null,
    showCryptDialog: false,
    // Settings dialog (data location) visibility.
    showSettingsDialog: false,
    // Help → Keyboard Shortcuts dialog visibility.
    showShortcutsDialog: false,
    // ⌘K-style command palette visibility.
    showCommandPalette: false,
    // What the palette lists: every menu command, or just the tools.
    paletteScope: 'all',
    // Mermaid diagram viewer: { name, code } while open, null when closed.
    mermaidView: null,
    // Image export of a SAVED diff: { id, name, dataUrl, width, height } while
    // the preview is open, null when closed. See exportImage().
    imageEntry: null,
    // True between opening the saved diff and taking its picture, so the app can
    // stay out of the shot (no dialog, no toast) while the shutter is open.
    imageCapturing: false,
    // Bumped by DiffViewer on every onDidUpdateDiff — the only honest signal
    // that Monaco's diff worker has returned and its decorations are painted.
    diffRevision: 0,
    // Tab id awaiting a discard confirmation, or null. Closing a tab is the one
    // way paste-mode text can be lost — it exists nowhere else.
    pendingTabClose: null,
    // Content last dismissed per side, so the format-hint banner stays gone until
    // that side's content changes.
    dismissedFormatHint: { left: null, right: null }
  }),
  getters: {
    ready: (s) => !!s.left && !!s.right,
    // Anything on screen — gates whether a menu-imported diff may take over.
    hasActive: (s) =>
      s.mode === 'paste'
        ? !!(s.pasteLeft || s.pasteRight || s.pasteLeftFile || s.pasteRightFile)
        : !!(s.left || s.right),
    // Two sides that diff to nothing — an affirmative "identical" state.
    identical: (s) => !!s.left && !!s.right && s.stats?.additions === 0 && s.stats?.deletions === 0,
    // A comparison is actually on screen to photograph. Paste mode shows two
    // textareas, not a diff, so there is nothing to take a picture of there.
    canExportImage: (s) => s.mode !== 'paste' && !!s.left && !!s.right,
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
    // The empty-state format tiles pick into the first free side.
    pickFormat(format) {
      return this.pick(this.left ? 'right' : 'left', format)
    },
    async pick(side, format) {
      const file = await window.api.openFile(side, format)
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
    // Apply a unified .patch to a chosen base file and open base ↔ patched in
    // the diff view, so the change is shown, not just written.
    async applyPatch() {
      const base = await window.api.openFile('base')
      if (!base || base.error || typeof base.content !== 'string') return
      const patchFile = await window.api.openFile('patch')
      if (!patchFile || patchFile.error || typeof patchFile.content !== 'string') return
      const { output, rejected, error } = applyUnifiedDiff(base.content, patchFile.content)
      if (error) {
        this.showNotice(`"${patchFile.name}" is not a unified diff.`)
        return
      }
      this.left = { path: base.path, name: base.name, content: base.content }
      this.right = { path: null, name: `${base.name} (patched)`, content: output }
      this.mode = 'files'
      this.diffSaved = false
      if (rejected.length) {
        this.showNotice(
          `Applied — ${rejected.length} hunk(s) didn't match the base and were skipped.`
        )
      }
    },
    // Export the current comparison as a self-contained HTML file for a ticket
    // or PR. The document is built in the renderer (diffToHtml); main only saves.
    async exportDiff() {
      const [l, r] = comparedSides(this)
      const leftText = l.content ?? ''
      const rightText = r.content ?? ''
      if (!leftText && !rightText) {
        this.showNotice('Nothing to export yet.')
        return
      }
      const { html, error } = diffToHtml(leftText, rightText, {
        leftName: l.name,
        rightName: r.name
      })
      if (error) {
        this.showNotice('This comparison is too large to export.')
        return
      }
      const res = await window.api.exportDiffHtml({ html, name: `${l.name}-vs-${r.name}` })
      if (res?.ok) this.showNotice('Exported diff to HTML.')
    },
    // Export a SAVED diff as a picture of the app's own diff view: the entry is
    // opened first, so the screenshot shows the real thing, with this theme's
    // colours and Monaco's highlighting, rather than a redrawn approximation
    // that would drift from the app.
    async exportImage(id) {
      const vault = useVaultStore()
      const entry = vault.entries.find((e) => e.id === id)
      if (!entry) return
      const payload = await vault.load(id)
      if (!payload) {
        return this.showNotice('This saved diff has expired or could not be decrypted.')
      }
      this.restore(payload)
      // Restoring replaces the models, so there is never a selection to honour.
      const res = await this._shoot({ awaitRediff: true })
      if (res?.error) return this.showNotice('Could not take a picture of this diff.')
      this.imageEntry = { id, name: entry.name, ...res }
    },
    // Export what is on screen right now, saved or not. Lines selected in either
    // pane narrow the picture to just those; with none it covers the whole diff.
    async exportCurrentImage() {
      if (!this.canExportImage) return this.showNotice('Nothing to export yet.')
      const res = await this._shoot({ band: getDiffScroller()?.selection() ?? null })
      if (res?.error) return this.showNotice('Could not take a picture of this diff.')
      const [l, r] = comparedSides(this)
      this.imageEntry = { id: null, name: `${l.name} ↔ ${r.name}`, ...res }
    },
    // The shutter. `finally` matters: a stuck imageCapturing would leave the
    // shortcut bar hidden for the rest of the session.
    async _shoot({ band = null, awaitRediff = false } = {}) {
      this.imageCapturing = true
      try {
        // Only a restore re-diffs, and that must land and paint before the shot
        // — counting frames alone photographed the previous diff, or this one
        // with no highlights. Waiting for a re-diff that isn't coming would just
        // burn the timeout, so exporting what's already on screen skips it.
        if (awaitRediff) await untilChanged(() => this.diffRevision)
        await afterFrames(CAPTURE_FRAMES)
        return await this._shootRegion(band)
      } catch {
        return { error: 'capture-failed' }
      } finally {
        this.imageCapturing = false
      }
    },
    // One shot when the whole diff fits its pane, scroll-and-stitch otherwise.
    // A band always takes the sliced path: the single-shot rect starts at the
    // top of the column, which is exactly what a chosen range is not.
    async _shootRegion(band) {
      const scroller = getDiffScroller()
      const region = scroller && captureRegionOf()
      const plan = region ? this._planShots(scroller, band) : { slices: [], truncated: false }
      if (plan.slices.length > 1 || (band && plan.slices.length)) {
        return this._shootTall(plan, region, scroller)
      }
      if (band) return { error: 'no-view' }
      // Short diff, or a viewer with no Monaco behind it (the spreadsheet grid):
      // captureRectOf already crops the empty pane away.
      const rect = captureRectOf()
      return rect ? window.api.captureDiffImage(rect) : { error: 'no-view' }
    },
    _planShots(scroller, band) {
      return planSlices({
        contentHeight: scroller.contentHeight(),
        viewportHeight: scroller.viewportHeight(),
        maxHeight: useSettingsStore().maxExportHeightPx,
        from: band?.top ?? 0,
        to: band?.bottom
      })
    },
    async _shootTall(plan, region, scroller) {
      const was = scroller.scrollTop()
      const { x, width, y: top } = region.content
      const headerHeight = region.editorY - top
      try {
        for (const [i, s] of plan.slices.entries()) {
          scroller.scrollTo(s.scrollTop)
          await afterFrames(SCROLL_FRAMES)
          const rect =
            i === 0
              ? { x, y: top, width, height: headerHeight + s.height }
              : { x, y: region.editorY + s.offsetY, width, height: s.height }
          const added = await window.api.appendDiffImageSlice(rect, i === 0)
          if (added?.error) return added
        }
      } finally {
        scroller.scrollTo(was)
      }
      const shot = await window.api.stitchDiffImage()
      return shot?.error ? shot : { ...shot, truncated: plan.truncated }
    },
    // Post-save routing: a "save first" chain resumes its deferred action,
    // otherwise a paste-mode save runs the comparison and confirms the save.
    async finishSave(wasPaste, ttlHours) {
      this.markSaved()
      if (this.replaceAfterSave) {
        this.showNotice('Saved. Loading the dropped file…')
        return this.finishReplaceAfterSave()
      }
      if (this.pickAfterSave) {
        this.showNotice('Saved. Loading the file…')
        return this.finishPickAfterSave()
      }
      if (wasPaste) {
        this.comparePasted()
        this.markSaved()
      }
      this.showNotice(
        ttlHours ? `Saved — expires in ${ttlHours} h.` : 'Saved — kept until you delete it.'
      )
    },
    // Closing the active tab from a menu or accelerator takes the same confirm
    // path the tab's own × does.
    requestActiveTabClose() {
      const tabs = useTabsStore()
      const tab = tabs.active
      if (!tab) return
      if (!tab.diffSaved && !isBlank(tab)) this.pendingTabClose = tab.id
      else tabs.close(tab.id)
    },
    confirmTabClose() {
      const id = this.pendingTabClose
      this.pendingTabClose = null
      if (id) useTabsStore().close(id)
    },
    cancelTabClose() {
      this.pendingTabClose = null
    },
    closeImageExport() {
      this.imageEntry = null
      window.api.forgetDiffImage()
    },
    // Both act on the capture main is still holding — no image bytes are sent
    // back across the boundary to be re-decoded.
    async copyImage() {
      const res = await window.api.copyDiffImage()
      this.showNotice(res?.ok ? 'Diff image copied to clipboard.' : 'Could not copy the image.')
      return !!res?.ok
    },
    async saveImage() {
      const res = await window.api.saveDiffImage(this.imageEntry?.name ?? 'diff')
      if (res?.ok) this.showNotice(`Saved diff image to ${res.path}`)
      else if (!res?.canceled) this.showNotice('Could not save the image.')
    },
    // Orchestrates the snippet import (the work + validation live in the snippet
    // store / parser) and reports the outcome through the shared notice.
    async importSnippets() {
      const res = await useSnippetStore().importFromFile()
      if (res?.cancelled) return
      if (res?.error) {
        this.showNotice(
          res.error === 'too-large'
            ? 'That file is too large to import.'
            : 'Could not read that file.'
        )
        return
      }
      this.showNotice(
        res.count ? `Imported ${res.count} snippet(s).` : 'No snippets found to import.'
      )
    },
    // 2+ files fill both sides; 1 onto a slot fills it; 1 while a comparison is
    // loaded starts fresh on the left; 1 otherwise fills the first empty side.
    async dropFiles(paths, targetSide = null) {
      if (!paths.length) return
      if (targetSide && paths.length === 1) {
        await this.drop(targetSide, paths[0])
        return
      }
      // Discards a complete unsaved comparison? Ask first.
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
      // A dropped file brings its own name; typed text takes the one given for
      // that side, or the placeholder.
      const l = this.pasteLeftFile ?? {
        name: sideName('left', this.pasteLeftName),
        content: this.pasteLeft
      }
      const r = this.pasteRightFile ?? {
        name: sideName('right', this.pasteRightName),
        content: this.pasteRight
      }
      this.left = { path: null, name: l.name, content: l.content }
      this.right = { path: null, name: r.name, content: r.content }
      this.mode = 'files'
      this.diffSaved = false
    },
    togglePasteMode() {
      this.mode = this.mode === 'paste' ? 'files' : 'paste'
    },
    // Ctrl/Cmd+V paste-to-compare. Ask before reading the clipboard.
    async requestPasteFromClipboard() {
      if (this.pastePrompt) return
      if (this.left?.kind === 'spreadsheet' || this.right?.kind === 'spreadsheet') {
        this.showNotice('Paste-to-compare works with text, not a spreadsheet.')
        return
      }
      // Copied files are unambiguous — load them without asking. The prompt
      // exists for pasted TEXT, where entering paste mode is a real decision.
      if (await this.pasteClipboardFiles()) return
      this.pastePrompt = 'enter'
    },
    async confirmPasteEnter() {
      const text = (await window.api?.readText?.()) ?? ''
      if (!text.trim()) {
        this.pastePrompt = null
        this.showNotice('The clipboard is empty — nothing to paste.')
        return
      }
      // A loaded comparison: paste into its empty side, not the paste textareas
      // (which would orphan the loaded file).
      if (this.mode === 'files' && (this.left || this.right)) {
        this.pasteIntoComparison(text)
      } else {
        this.pasteIntoPasteFields(text)
      }
    },
    // Two copied files become the two sides; one fills the first free side.
    // Returns true when the clipboard held files and they were loaded.
    async pasteClipboardFiles() {
      const files = (await window.api?.readClipboardFiles?.()) ?? []
      if (!files.length) return false
      this.pastePrompt = null
      this.mode = 'files'
      if (files.length > 1) {
        this.receive('left', files[0])
        this.receive('right', files[1])
      } else {
        this.receive(this.left ? 'right' : 'left', files[0])
      }
      return true
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
        this.showNotice(
          `"${file.name}" is a spreadsheet — open it as a file comparison, not in paste mode.`
        )
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
    // Idempotent, so calling on focus rolls the daily theme over at midnight.
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
    // Re-read one slot quietly; returns the file name if its content changed.
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
    // Follow external edits on focus; one coalesced notice so simultaneous
    // changes don't race the toast timer.
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
    // Recompute a clean git-style patch (Monaco's on-screen diff isn't one).
    // Clipboard goes through main — navigator.clipboard is denied here.
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
    // Everything a saved diff needs to restore later (incl. paste-mode text).
    snapshot() {
      return {
        mode: this.mode,
        left: this.left,
        right: this.right,
        pasteLeft: this.pasteLeft,
        pasteRight: this.pasteRight,
        pasteLeftFile: this.pasteLeftFile,
        pasteRightFile: this.pasteRightFile,
        pasteLeftName: this.pasteLeftName,
        pasteRightName: this.pasteRightName,
        renderSideBySide: this.renderSideBySide,
        ignoreTrimWhitespace: this.ignoreTrimWhitespace
      }
    },
    restore(payload) {
      // The incoming diff has not been computed yet; keeping the outgoing one's
      // counts would caption it with another comparison's numbers.
      this.stats = null
      this.left = payload.left
      this.right = payload.right
      this.pasteLeft = payload.pasteLeft ?? ''
      this.pasteRight = payload.pasteRight ?? ''
      this.pasteLeftFile = payload.pasteLeftFile ?? null
      this.pasteRightFile = payload.pasteRightFile ?? null
      this.pasteLeftName = payload.pasteLeftName ?? ''
      this.pasteRightName = payload.pasteRightName ?? ''
      this.renderSideBySide = payload.renderSideBySide ?? true
      this.ignoreTrimWhitespace = payload.ignoreTrimWhitespace ?? false
      this.mode = payload.mode ?? 'files'
      // Opened from a saved diff: it already exists in the vault, so replacing
      // it later needs no "you'll lose it" prompt.
      this.diffSaved = true
    },
    // A result chosen in the quick look-up (main forwards { kind, id }); the big
    // view does the load/restore the launcher stays out of.
    async openFromQuickLook(payload) {
      if (!payload?.id) return
      if (payload.kind === 'snippet') {
        useSnippetStore().editingSnippet = { id: payload.id }
        return
      }
      const p = await useVaultStore().load(payload.id)
      if (p) this.restore(p)
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
      // One choke point, so a tool opened from the menu, a shortcut, the shelf
      // or the palette all count towards the shelf's recents.
      const tool = TOOLS.find((t) => t.action === action)
      if (tool) useSettingsStore().noteToolUsed(tool.id)
    },
    // The command palette, scoped to tools (sidebar shelf → "Search tools…").
    openToolsPalette() {
      this.paletteScope = 'tools'
      this.showCommandPalette = true
    },
    // Save first (a share file needs a name + expiry), then the recipient picker.
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
    // The save step of the "share current diff" flow captured this draft instead of
    // persisting — opening the recipient picker with it pending (see SaveDiffDialog).
    beginShareDraft(draft) {
      this.shareDraft = draft
    },
    async shareTo(recipientFp) {
      const vault = useVaultStore()
      const draft = this.shareDraft
      const id = this.shareEntryId
      this.shareDraft = null
      this.shareEntryId = null
      const res = draft
        ? await vault.shareDraft(draft, recipientFp)
        : await vault.share(id, recipientFp)
      if (res.ok) {
        if (draft) this.markSaved() // the draft's local twin now exists on disk
        this.showNotice(`Sealed shared diff for "${res.to}" written to ${res.path}`)
      } else if (res.error) {
        this.showNotice(SHARE_ERRORS[res.error] ?? 'Sharing failed.')
      }
    },
    // Import a sealed diff and open it — but only when nothing is on screen; with
    // a diff loaded, keep the view and leave it in External diffs.
    async importShared() {
      const res = await useVaultStore().importShared()
      if (!res.ok) {
        if (res.error) this.showNotice(SHARE_ERRORS[res.error] ?? 'Import failed.')
        return
      }
      if (this.hasActive) {
        this.showNotice(
          `Imported "${res.entry.name}" from ${res.from} into External diffs — kept your current diff open; select it there to view.`
        )
        return
      }
      await this._openImported(res)
      this.showNotice(`Opened "${res.entry.name}" from ${res.from} — same expiry as on the sender.`)
    },
    // A dropped .diffbro opens straight away (a drop is an explicit "show me
    // this", so unlike menu-import it ignores hasActive).
    async receiveDroppedSharedDiff(path) {
      const res = await useVaultStore().importSharedFromPath(path)
      if (!res.ok) {
        if (res.error) this.showNotice(SHARE_ERRORS[res.error] ?? 'Import failed.')
        return
      }
      await this._openImported(res)
      this.showNotice(
        `Imported "${res.entry.name}" from ${res.from} — same expiry as on the sender.`
      )
    },
    // Decrypt a just-imported share and show it (shared by drop + menu paths).
    async _openImported(res) {
      const payload = await useVaultStore().load(res.id)
      if (payload) this.restore(payload)
    },
    // Export this install's public key, tagged with the user's display name.
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
    // Pick a key file, then require a name before adding.
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
    // A dropped .diffbrokey: validate, then open the naming dialog before adding.
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
      // Cleared only after the write, or the manager re-reads before the key lands.
      this.pendingTrustedKey = null
      if (res.ok) {
        this.showNotice(`Now trusting "${res.label}" (${res.fingerprint}).`)
        // Flag the new key so the manager highlights it.
        this.lastAddedTrustedFp = res.fingerprint
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
