import { defineStore } from 'pinia'
import { resolveAdapter } from '../adapters'
import { csvAdapter } from '../adapters/csvAdapter'
import { structuredKind } from '../utils/structuralDiff'
import { delimitedKind } from '../utils/csv'
import { restoredSemanticView, shouldOpenSemantic } from '../utils/viewChrome'
import { lockPairOf } from '../utils/lockfile/lockPair'
import { structurePairDiff } from '../utils/structurePair'
import { useVaultStore } from './vaultStore'
import { useSnippetStore } from './snippetStore'
import { isSecret } from '../utils/secretSnippet'
import { snippetSource } from '../utils/snippetSource'
import { detectTextFormat, formatJson, formatXml } from '../utils/textFormats'
import { applyUnifiedDiff } from '../utils/unifiedDiff'
import { diffPatchFile } from '../utils/copyAsFile'
import { diffToHtml } from '../utils/diffHtml'
import { changeRegister, toCsv } from '../utils/changeRegister'
import { clipboardSnippetName } from '../utils/cliCommand'
import { detectSnippetLanguage } from '../utils/detectLanguage'
import { looksLikeMermaid } from '../utils/mermaid'
import { sideName } from '../utils/pasteNames'
import { STREAMED_LIMITS } from '../utils/streamedLimits'
import { mergeFormatBanner } from '../utils/formatBanner'
import { t } from '../i18n'

// The builder returns a sentinel for the streamed case so it need not carry the
// store's own wording for a limit the store already owns.
const patchError = (reason) => (reason === 'streamed' ? t(STREAMED_LIMITS.copy) : reason)

let noticeTimer = null
let diskNoticeTimer = null

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

const reloadedNote = (names) => {
  if (!names.length) return ''
  if (names.length === 1) return `"${names[0]}" changed on disk — diff reloaded.`
  return `${names.length} files changed on disk — diff reloaded.`
}
const heldNote = (names) => {
  if (!names.length) return ''
  const which = names.length === 1 ? `"${names[0]}"` : `${names.length} files`
  return `${which} changed on disk — your formatted copy was kept. Open it again to take the new one.`
}

export const DISK_NOTICE_MS = 10_000

export const useDiffStore = defineStore('diff', {
  state: () => ({
    left: null, // { path, name, content, encoding, size }
    right: null,
    renderSideBySide: true,
    // Diagram view: show only what changed plus a ring of context.
    diagramFocus: true,
    // Compare the two sides as data rather than as lines, when both parse.
    semanticView: false,
    // Unchanged rows are most of a config file; off, the tree shows only what moved.
    structureShowAll: false,
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
    // { additions, deletions } from the diff editor, null before first diff
    stats: null,
    // transient user-facing message (binary file rejected, etc.)
    notice: null,
    // A file moved under the comparison: its own dismissible label, not a toast.
    diskNotice: null,
    // The `diffbro compare` refusal when every tab is in use (utils/cli message).
    cliBlocked: null,
    // Everything that refusal has covered since it was last dismissed.
    blockedFiles: [],
    // save-diff dialog visibility
    showSaveDialog: false,
    // Dropped paths / picked file awaiting the "replace current diff?" confirm;
    // the *AfterSave twins carry them through the save dialog on "Save first".
    pendingReplace: null,
    replaceAfterSave: null,
    pendingPick: null,
    pickAfterSave: null,
    // Saved (or opened from a saved diff) and unchanged since, so overwriting is
    // safe and skips the replace prompt. Any edit clears it.
    diffSaved: false,
    // Bumped by DiffViewer on every onDidUpdateDiff — the only honest signal
    // that Monaco's diff worker has returned and its decorations are painted.
    diffRevision: 0,
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
    isSpreadsheet() {
      return (
        this.leftComparable?.kind === 'spreadsheet' || this.rightComparable?.kind === 'spreadsheet'
      )
    },
    // Distinct from canSave, which only asks whether a comparison is here at all
    // (Share and the paste-mode Compare want that one).
    hasUnsavedWork() {
      return this.canSave && !this.diffSaved
    },
    // What is on screen came out of the vault — saved here or imported as an
    // external diff — rather than being scratch work.
    isSavedDiff() {
      return this.hasActive && this.diffSaved
    },
    // Clear throws work away, and a vault-backed tab has none to throw: emptying
    // it left the tab still holding the old snapshot, so the pane went blank
    // while the tab claimed the diff and reopening the entry made a second tab.
    // Closing the tab is the way out of one of those.
    canClear() {
      return this.hasActive && !this.diffSaved
    },
    // Saving keeps its own encrypted copy of both sides, which is exactly what a
    // file too large to hold cannot provide.
    canSave() {
      if (this.isStreamed) return false
      return this.mode === 'paste'
        ? !!(this.pasteLeft || this.pasteRight || this.pasteLeftFile || this.pasteRightFile)
        : this.ready
    },
    leftComparable: (s) => (s.left ? resolveAdapter(s.left).toComparable(s.left) : null),
    rightComparable: (s) => (s.right ? resolveAdapter(s.right).toComparable(s.right) : null),
    // The format both sides are, or null when a structural comparison is not on
    // offer (different formats, unparseable, or not structured at all).
    structuredFormat: (s) =>
      s.ready && s.left?.content !== undefined && s.right?.content !== undefined
        ? structuredKind(s.left, s.right)
        : null,
    // The delimiter both sides parse as, when they are delimited text — the same
    // toggle, showing a grid instead of a tree.
    delimitedFormat: (s) =>
      s.ready && s.left?.content !== undefined && s.right?.content !== undefined
        ? delimitedKind(s.left, s.right)
        : null,
    canCompareStructure() {
      return !!this.structuredFormat || !!this.delimitedFormat
    },
    // Both sides are diagrams, so they can be compared as pictures rather than
    // as text — where an inserted stage re-indents every following line and a
    // one-node change reads as a rewrite. Streamed is out: its content is never
    // in memory whole.
    canCompareDiagram() {
      if (this.isStreamed) return false
      const [l, r] = [this.left?.content, this.right?.content]
      return (
        typeof l === 'string' && typeof r === 'string' && looksLikeMermaid(l) && looksLikeMermaid(r)
      )
    },
    // What the toggle calls itself: delimited text becomes a grid, everything
    // else a tree. A KEY — as a word it stayed English in every locale.
    structureLabelKey() {
      if (this.canCompareDiagram) return 'appToolbar.structureDiagram'
      if (this.canCompareDeps) return 'appToolbar.structureDeps'
      return this.delimitedFormat ? 'appToolbar.structureGrid' : 'appToolbar.structure'
    },
    structureDiff() {
      return structurePairDiff(this.left, this.right, this.structuredFormat)
    },
    lockPair() {
      return lockPairOf(this.left, this.right)
    },
    canCompareDeps() {
      return this.lockPair !== null
    },
    // Deps outranks tree: a lockfile IS json, and a 780-key tree is not what
    // the reader opened it for.
    semanticKind() {
      if (!this.semanticView) return null
      if (this.canCompareDiagram) return 'diagram'
      if (this.canCompareDeps) return 'deps'
      if (this.delimitedFormat) return 'spreadsheet'
      return this.canCompareStructure ? 'tree' : null
    },
    // Text is the default so an empty/paste state routes to Monaco; streamed
    // wins, because a file too large to hold has no content to compare.
    comparableKind() {
      const semantic = this.semanticKind
      if (semantic) return semantic
      const kinds = [this.leftComparable?.kind, this.rightComparable?.kind]
      if (kinds.includes('streamed')) return 'streamed'
      return kinds.find(Boolean) ?? 'text'
    },
    // The two grids the spreadsheet viewer diffs — parsed from a workbook, or
    // from delimited text the reader asked to see as a grid.
    gridSheets() {
      const delimiter = this.delimitedFormat
      if (this.semanticView && delimiter) {
        return {
          left: csvAdapter.toComparable(this.left, delimiter).sheets,
          right: csvAdapter.toComparable(this.right, delimiter).sheets
        }
      }
      return {
        left: this.leftComparable?.sheets ?? [],
        right: this.rightComparable?.sheets ?? []
      }
    },
    isStreamed() {
      return this.comparableKind === 'streamed'
    },
    // A streamed side is read back off disk by path, so it can only be compared
    // with another file on disk — never with pasted text.
    streamedPairReady: (s) => !!(s.left?.path && s.right?.path),
    leftFormatHint: (s) => formatHintFor(s.left, s.dismissedFormatHint.left),
    rightFormatHint: (s) => formatHintFor(s.right, s.dismissedFormatHint.right),
    // One merged banner for both sides (see mergeFormatBanner) — null when neither
    // side has a pending hint.
    formatBanner() {
      return mergeFormatBanner(this.leftFormatHint, this.rightFormatHint, t)
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
    // A source is either a path still to be read or a file the main process has
    // already read for us (the clipboard hands over whole files). Reading an
    // already-read file again is what showed the large-file prompt twice.
    async _place(side, source) {
      this.receive(side, typeof source === 'string' ? await window.api.readFile(source) : source)
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
      if (this.isStreamed) {
        this.showNotice(t(STREAMED_LIMITS.exportHtml))
        return
      }
      const [l, r] = comparedSides(this)
      const leftText = l.content ?? ''
      const rightText = r.content ?? ''
      if (!leftText && !rightText) {
        this.showNotice(t('diffNotices.nothingToExportYet'))
        return
      }
      const { html, error } = diffToHtml(leftText, rightText, {
        leftName: l.name,
        rightName: r.name
      })
      if (error) {
        this.showNotice(t('diffNotices.thisComparisonIsTooLarge'))
        return
      }
      const res = await window.api.exportDiffFile({
        text: html,
        format: 'html',
        name: `${l.name}-vs-${r.name}`
      })
      if (res?.ok) this.showNotice(t('diffNotices.exportedDiffToHTML'))
    },
    // The grid diff as a table a reviewer can take away. The register is built
    // here and only its finished text crosses the boundary.
    async exportChangeRegister(sheets) {
      const rows = changeRegister(sheets)
      if (rows.length < 2) {
        this.showNotice(t('diffNotices.noChangesToExport'))
        return
      }
      const name = `${this.left?.name ?? 'left'}-vs-${this.right?.name ?? 'right'}-changes`
      const res = await window.api.exportDiffFile({ text: toCsv(rows), format: 'csv', name })
      if (res?.ok) this.showNotice(`Exported ${rows.length - 1} changes.`)
    },
    // Post-save routing: a "save first" chain resumes its deferred action,
    // otherwise a paste-mode save runs the comparison and confirms the save.
    async finishSave(wasPaste, ttlHours) {
      this.markSaved()
      if (this.replaceAfterSave) {
        this.showNotice(t('diffNotices.savedLoadingTheDroppedFile'))
        return this.finishReplaceAfterSave()
      }
      if (this.pickAfterSave) {
        this.showNotice(t('diffNotices.savedLoadingTheFile'))
        return this.finishPickAfterSave()
      }
      if (wasPaste) {
        this.comparePasted()
        this.markSaved()
      }
      this.showNotice(
        ttlHours
          ? t('diffNotices.savedExpiresIn', { hours: ttlHours })
          : t('diffNotices.savedKeptUntilYouDelete')
      )
    },
    // Orchestrates the snippet import (the work + validation live in the snippet
    // store / parser) and reports the outcome through the shared notice.
    async importSnippets() {
      const res = await useSnippetStore().importFromFile()
      if (res?.cancelled) return
      if (res?.error) {
        this.showNotice(
          res.error === 'too-large'
            ? t('diffNotices.thatFileIsTooLarge')
            : t('diffNotices.couldNotReadThatFile')
        )
        return
      }
      this.showNotice(
        res.count
          ? t('diffNotices.importedSnippets', res.count)
          : t('diffNotices.noSnippetsFoundToImport')
      )
    },
    // 2+ files fill both sides; 1 onto a slot fills it; 1 while a comparison is
    // loaded starts fresh on the left; 1 otherwise fills the first empty side.
    async dropFiles(sources, targetSide = null) {
      if (!sources.length) return
      if (targetSide && sources.length === 1) {
        await this._place(targetSide, sources[0])
        return
      }
      // Discards a complete unsaved comparison? Ask first.
      if (this.left && this.right) {
        if (!this.diffSaved) {
          this.pendingReplace = sources.slice(0, 2)
          return
        }
        await this._loadReplacement(sources.slice(0, 2))
        return
      }
      if (sources.length >= 2) {
        await this._place('left', sources[0])
        await this._place('right', sources[1])
        return
      }
      // First file of a new comparison — load it and wait for the second.
      await this._place(!this.left ? 'left' : 'right', sources[0])
    },
    // Clear and load the replacement file(s). One file lands on the left and
    // waits for a second; two files fill both sides.
    async _loadReplacement(sources) {
      this.clear()
      await this._place('left', sources[0])
      if (sources.length >= 2) await this._place('right', sources[1])
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
      if (file.error === 'unreadable') {
        this.showNotice(`"${file.name}" could not be read — is it a folder?`)
        return
      }
      // Any other error shape (e.g. a path main refused to serve) is not a
      // loadable file — never assign it to a side.
      if (file.error) return
      this[side] = file
      this.mode = 'files'
      this.diffSaved = false
      this.semanticView = shouldOpenSemantic(this)
    },
    comparePasted() {
      // Each side is a loaded file, else the textarea's pasted text — a dropped
      // file brings its own name, typed text takes the one given for that side.
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
      this.semanticView = shouldOpenSemantic(this)
    },
    togglePasteMode() {
      this.mode = this.mode === 'paste' ? 'files' : 'paste'
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
      if (file.kind === 'streamed') {
        this.showNotice(
          `"${file.name}" is too large to paste against — compare it with another file instead.`
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
    /**
     * Re-read one slot quietly.
     * @param {string} slot
     * @returns {Promise<{ name: string, held: boolean }|null>} null when nothing
     *   moved; `held` when the file changed but the app's own copy was kept.
     */
    async _reloadSlot(slot) {
      const current = this[slot]
      if (!current?.path) return null
      try {
        const file = await window.api.readFile(current.path, { quiet: true })
        if (!file || file.error) return null
        // Measured against the copy that WAS on disk, or Format's own rewrite
        // reads as someone else's edit. Both moved = report, never resolve: this
        // refresh is a background event nobody asked for.
        if (current.edited) {
          if (file.content === current.diskContent) return null
          return { name: file.name, held: true }
        }
        // What counts as changed is the format's business, not this one's.
        if (resolveAdapter(file).sameContent(file, current)) return null
        this[slot] = slot.startsWith('paste')
          ? { name: file.name, content: file.content, path: file.path }
          : file
        return { name: file.name, held: false }
      } catch {
        // File gone or unreadable now; keep showing the last loaded state.
        return null
      }
    },
    // Follow external edits on focus; one coalesced notice so simultaneous
    // changes don't race the toast timer.
    async refreshFromDisk() {
      const moved = []
      for (const slot of ['left', 'right', 'pasteLeftFile', 'pasteRightFile']) {
        const result = await this._reloadSlot(slot)
        if (result) moved.push(result)
      }
      if (!moved.length) return
      const reloaded = moved.filter((m) => !m.held).map((m) => m.name)
      const held = moved.filter((m) => m.held).map((m) => m.name)
      // No longer the copy in the vault, so it stops claiming to be it.
      if (reloaded.length) this.diffSaved = false
      this.showDiskNotice([reloadedNote(reloaded), heldNote(held)].filter(Boolean).join(' '))
    },
    showDiskNotice(text) {
      this.diskNotice = text
      clearTimeout(diskNoticeTimer)
      diskNoticeTimer = setTimeout(() => (this.diskNotice = null), DISK_NOTICE_MS)
    },
    dismissDiskNotice() {
      clearTimeout(diskNoticeTimer)
      this.diskNotice = null
    },
    // Recompute a clean git-style patch (Monaco's on-screen diff isn't one).
    // Clipboard goes through main — navigator.clipboard is denied here.
    async copyDiff() {
      const file = diffPatchFile(this)
      if (file.error) return this.showNotice(patchError(file.error))
      const out = await window.api.copyText(file.content)
      this.showNotice(
        out?.ok
          ? t('diffNotices.unifiedDiffCopiedToClipboard')
          : t('diffNotices.couldNotCopyTheDiff')
      )
    },
    // The twin: a real .patch file on the clipboard, for a destination that
    // wants a file rather than characters.
    async copyDiffAsFile() {
      const file = diffPatchFile(this)
      if (file.error) return this.showNotice(patchError(file.error))
      const out = await window.api.copyAsFile(file.name, file.content)
      this.showNotice(
        out?.ok
          ? t('diffNotices.copiedAsFile', { name: out.name })
          : t('diffNotices.couldNotCopyThatAs')
      )
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
      // diskContent is the baseline _reloadSlot measures against.
      this[side] = { ...file, content: pretty, edited: true, diskContent: file.content }
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
        ignoreTrimWhitespace: this.ignoreTrimWhitespace,
        semanticView: this.semanticView
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
      this.semanticView = restoredSemanticView(payload, this)
      this.mode = payload.mode ?? 'files'
      // Opened from a saved diff: it already exists in the vault, so replacing
      // it later needs no "you'll lose it" prompt.
      this.diffSaved = true
    },
    /**
     * Compare snippets dropped from the sidebar. Ids only — the content is read
     * here, so a drag can never carry a decrypted body. Routed through the same
     * dropFiles the file path uses, so the replace guard and one-then-wait are
     * not re-implemented where they could drift.
     * @param {string[]} ids
     * @param {string|null} [targetSide]
     */
    async dropSnippets(ids, targetSide = null) {
      const snippets = useSnippetStore()
      const sources = []
      for (const id of ids) {
        const entry = snippets.entries.find((e) => e.id === id)
        if (!entry) continue
        if (isSecret(entry)) {
          this.showNotice(t('diffNotices.hiddenSnippetsCanTBe'))
          return
        }
        const source = snippetSource(entry, await snippets.load(id))
        if (source) sources.push(source)
      }
      if (sources.length) await this.dropFiles(sources, targetSide)
    },
    async saveClipboardSnippet(text) {
      if (!String(text ?? '').trim()) {
        this.showNotice(t('diffNotices.theClipboardIsEmpty'))
        return
      }
      const snippets = useSnippetStore()
      const id = await snippets.add({
        name: clipboardSnippetName(),
        content: text,
        language: detectSnippetLanguage(text)
      })
      if (id) snippets.editingSnippet = { id }
    },
    dismissCliBlocked() {
      this.cliBlocked = null
      this.blockedFiles = []
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
    }
  }
})
