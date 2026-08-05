import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { runCommand } from '../../../src/renderer/src/utils/commands'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'
import { useShareStore } from '../../../src/renderer/src/features/share'
import { useConfigBackupStore } from '../../../src/renderer/src/features/configBackup'
import { useImageExportStore } from '../../../src/renderer/src/features/imageExport'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

// Menu actions dispatch through the command registry now, not the store. These
// stay here because what they assert is the real store effect, end to end.

const menu = (action) =>
  runCommand(action, {
    diff: useDiffStore(),
    tabs: useTabsStore(),
    settings: useSettingsStore(),
    ui: useUiStore(),
    share: useShareStore(),
    configBackup: useConfigBackupStore(),
    imageExport: useImageExportStore(),
    snippets: useSnippetStore()
  })

const FILE = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })

describe('diffStore', () => {
  it('is ready only when both sides are loaded', () => {
    const store = useDiffStore()
    expect(store.ready).toBe(false)
    store.left = FILE('a.txt')
    expect(store.ready).toBe(false)
    store.right = FILE('b.txt')
    expect(store.ready).toBe(true)
  })

  it('canSave follows the active mode', () => {
    const store = useDiffStore()
    expect(store.canSave).toBe(false)
    store.mode = 'paste'
    store.pasteLeft = 'something'
    expect(store.canSave).toBe(true)
    store.mode = 'files'
    expect(store.canSave).toBe(false) // files mode needs both files
  })

  it('rejects binary files with a notice and leaves the slot unchanged', () => {
    const store = useDiffStore()
    store.receive('left', { error: 'binary', name: 'blob.bin' })
    expect(store.left).toBeNull()
    expect(store.notice).toContain('blob.bin')
  })

  it('rejects an unreadable spreadsheet with a notice and leaves the slot empty', () => {
    const store = useDiffStore()
    store.receive('left', { error: 'xlsx', name: 'book.xlsx', message: 'DOCTYPE not allowed' })
    expect(store.left).toBeNull()
    expect(store.notice).toContain('book.xlsx')
    expect(store.notice).toContain('DOCTYPE not allowed')
  })

  it('loads a parsed spreadsheet and routes it to the grid viewer', () => {
    const store = useDiffStore()
    const sheets = [{ name: 'S1', rows: [['Region', 100]] }]
    store.receive('left', { path: '/tmp/l.xlsx', name: 'l.xlsx', kind: 'spreadsheet', sheets })
    store.receive('right', { path: '/tmp/r.xlsx', name: 'r.xlsx', kind: 'spreadsheet', sheets })
    expect(store.ready).toBe(true)
    expect(store.comparableKind).toBe('spreadsheet')
    expect(store.leftComparable).toEqual({ kind: 'spreadsheet', sheets })
  })

  it('comparableKind is text for the empty and text-file states', () => {
    const store = useDiffStore()
    expect(store.comparableKind).toBe('text')
    store.left = FILE('a.txt')
    expect(store.comparableKind).toBe('text')
  })

  // Delimited text reuses the structure toggle: off it is still a text diff,
  // on it routes to the same grid a workbook gets.
  describe('CSV grid view', () => {
    const CSV = (name, body) => ({ path: `/tmp/${name}`, name, content: body })
    const loadCsv = (store) => {
      store.receive('left', CSV('a.csv', 'id,qty\n1,7'))
      store.receive('right', CSV('b.csv', 'id,qty\n1,9'))
      return store
    }

    it('offers the toggle and calls it Grid', () => {
      const store = loadCsv(useDiffStore())
      expect(store.delimitedFormat).toBe(',')
      expect(store.canCompareStructure).toBe(true)
      expect(store.structureLabel).toBe('Grid')
    })

    // This asserted the opposite — text until you found the toggle — which meant
    // a spreadsheet opened in the one view it is not readable in. A delimited
    // pair now lands on the grid, and unticking is what returns it to lines.
    it('opens as a grid, and the toggle returns it to text', () => {
      const store = loadCsv(useDiffStore())
      expect(store.semanticView).toBe(true)
      expect(store.comparableKind).toBe('spreadsheet')
      store.semanticView = false
      expect(store.comparableKind).toBe('text')
    })

    it('parses both sides into grids for the viewer', () => {
      const store = loadCsv(useDiffStore())
      store.semanticView = true
      expect(store.gridSheets.left[0].rows).toEqual([
        ['id', 'qty'],
        [1, 7]
      ])
      expect(store.gridSheets.right[0].rows[1]).toEqual([1, 9])
    })

    it('keeps naming the toggle Structure for JSON', () => {
      const store = useDiffStore()
      store.receive('left', CSV('a.json', '{"a":1}'))
      store.receive('right', CSV('b.json', '{"a":2}'))
      expect(store.delimitedFormat).toBeNull()
      expect(store.structureLabel).toBe('Structure')
      store.semanticView = true
      expect(store.comparableKind).toBe('tree')
    })

    // A workbook never goes through the CSV path, toggle or not.
    it('leaves a parsed workbook on the grid it already has', () => {
      const store = useDiffStore()
      const sheets = [{ name: 'S1', rows: [['a', 1]] }]
      store.receive('left', { path: '/tmp/l.xlsx', name: 'l.xlsx', kind: 'spreadsheet', sheets })
      store.receive('right', { path: '/tmp/r.xlsx', name: 'r.xlsx', kind: 'spreadsheet', sheets })
      expect(store.delimitedFormat).toBeNull()
      expect(store.gridSheets.left).toEqual(sheets)
    })
  })

  it('refuses a spreadsheet dropped into paste mode', () => {
    const store = useDiffStore()
    store.receivePasteFile('left', { name: 'book.xlsx', kind: 'spreadsheet', sheets: [] })
    expect(store.pasteLeftFile).toBeNull()
    expect(store.notice).toContain('book.xlsx')
  })

  it('swap exchanges the two sides', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.swap()
    expect(store.left.name).toBe('b.txt')
    expect(store.right.name).toBe('a.txt')
  })

  it('snapshot/restore roundtrips the full comparison state', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'L'
    store.pasteRight = 'R'
    store.renderSideBySide = false
    store.ignoreTrimWhitespace = true
    const snap = store.snapshot()

    store.$reset()
    store.restore(snap)
    expect(store.mode).toBe('paste')
    expect(store.pasteLeft).toBe('L')
    expect(store.pasteRight).toBe('R')
    expect(store.renderSideBySide).toBe(false)
    expect(store.ignoreTrimWhitespace).toBe(true)
  })

  it('comparePasted promotes pasted text into the diff view', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'old'
    store.pasteRight = 'new'
    store.comparePasted()
    expect(store.mode).toBe('files')
    expect(store.left.content).toBe('old')
    expect(store.right.content).toBe('new')
    expect(store.ready).toBe(true)
  })

  it('partial paste: compares pasted text against a loaded file', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'typed original'
    store.receivePasteFile('right', { name: 'changed.txt', content: 'file body' })
    expect(store.canSave).toBe(true)
    store.comparePasted()
    expect(store.mode).toBe('files')
    expect(store.left).toMatchObject({ name: 'Left (pasted)', content: 'typed original' })
    expect(store.right).toMatchObject({ name: 'changed.txt', content: 'file body' })
  })

  it('receivePasteFile rejects a binary file and keeps the side as a textarea', () => {
    const store = useDiffStore()
    store.receivePasteFile('left', { error: 'binary', name: 'blob.bin' })
    expect(store.pasteLeftFile).toBeNull()
    expect(store.notice).toContain('blob.bin')
  })

  it('clearPasteFile returns a paste side to its textarea', () => {
    const store = useDiffStore()
    store.receivePasteFile('left', { name: 'a.txt', content: 'x' })
    expect(store.pasteLeftFile).not.toBeNull()
    store.clearPasteFile('left')
    expect(store.pasteLeftFile).toBeNull()
  })

  it('pastePickFile loads the chosen file into one side', async () => {
    const store = useDiffStore()
    window.api.openFile = async (side) => ({ name: `${side}.txt`, content: 'picked' })
    await store.pastePickFile('right')
    expect(store.pasteRightFile).toEqual({ name: 'right.txt', content: 'picked', path: null })
  })

  it('dropFiles loads two dropped files into left and right', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({
      path,
      name: path.split('/').pop(),
      content: `c:${path}`
    })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    expect(store.left.name).toBe('a.txt')
    expect(store.right.name).toBe('b.txt')
    expect(store.ready).toBe(true)
  })

  it('dropFiles with one file fills the first empty side (left, then right)', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/first.txt'])
    expect(store.left.name).toBe('first.txt')
    expect(store.right).toBeNull()
    await store.dropFiles(['/tmp/second.txt'])
    expect(store.right.name).toBe('second.txt')
  })

  it('dropFiles targets a specific slot when a side is given', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/only.txt'], 'right')
    expect(store.right.name).toBe('only.txt')
    expect(store.left).toBeNull()
  })

  it('dropFiles: a third single file prompts before replacing a complete diff', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    expect(store.ready).toBe(true)
    await store.dropFiles(['/tmp/c.txt']) // third file -> confirmation, not silent replace
    expect(store.pendingReplace).toEqual(['/tmp/c.txt'])
    expect(store.left.name).toBe('a.txt') // still the old diff until confirmed
    await store.confirmReplace()
    expect(store.left.name).toBe('c.txt')
    expect(store.right).toBeNull()
  })

  it('dropFiles: dropping two files onto a complete diff also prompts, then fills both', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    await store.dropFiles(['/tmp/c.txt', '/tmp/d.txt'])
    expect(store.pendingReplace).toEqual(['/tmp/c.txt', '/tmp/d.txt'])
    expect(store.left.name).toBe('a.txt')
    await store.confirmReplace()
    expect(store.left.name).toBe('c.txt')
    expect(store.right.name).toBe('d.txt')
  })

  it('dropFiles onto a specific slot replaces just that side without prompting', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    await store.dropFiles(['/tmp/new.txt'], 'left')
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('new.txt')
    expect(store.right.name).toBe('b.txt')
  })

  it('cancelReplace drops the pending replacement, keeping the current diff', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    await store.dropFiles(['/tmp/c.txt'])
    store.cancelReplace()
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('a.txt')
    expect(store.right.name).toBe('b.txt')
  })

  it('clear wipes loaded files and paste-mode text', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.pasteLeft = 'lingering left'
    store.pasteRight = 'lingering right'
    store.clear()
    expect(store.left).toBeNull()
    expect(store.right).toBeNull()
    expect(store.pasteLeft).toBe('')
    expect(store.pasteRight).toBe('')
  })

  // Clearing a vault-backed tab emptied the document but left the tab holding
  // the old snapshot, so the pane went blank while the tab still claimed the
  // diff — and reopening that entry spawned a second tab instead of reusing it.
  it('offers Clear for scratch work only, and hides it on a vault-backed diff', () => {
    const store = useDiffStore()
    expect(store.canClear).toBe(false)
    expect(store.isSavedDiff).toBe(false) // an empty tab keeps the button
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    expect(store.canClear).toBe(true)
    expect(store.isSavedDiff).toBe(false)
    store.diffSaved = true
    expect(store.canClear).toBe(false)
    expect(store.isSavedDiff).toBe(true)
  })

  it('ignores a Clear from the menu on a saved or external diff', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.diffSaved = true
    menu('clear')
    expect(store.left).not.toBeNull()
    store.diffSaved = false
    menu('clear')
    expect(store.left).toBeNull()
  })

  // Guarded now: the flag is only flipped where a viewer reads it, so the
  // comparison has to be a real one (utils/viewChrome.js).
  it('routes menu actions: toggle-split flips the view option', () => {
    const store = useDiffStore()
    store.left = { name: 'a', content: 'x' }
    store.right = { name: 'b', content: 'y' }
    const before = store.renderSideBySide
    menu('toggle-split')
    expect(store.renderSideBySide).toBe(!before)
  })

  it('routes menu actions: toggle-split does nothing where no viewer reads it', () => {
    const store = useDiffStore()
    const before = store.renderSideBySide
    menu('toggle-split') // nothing loaded, so nothing to split
    expect(store.renderSideBySide).toBe(before)
  })

  it('only opens the save dialog when there is something to save', () => {
    const store = useDiffStore()
    menu('save')
    expect(store.showSaveDialog).toBe(false)
    store.mode = 'paste'
    store.pasteLeft = 'x'
    menu('save')
    expect(store.showSaveDialog).toBe(true)
  })

  it('routes menu actions: tools-base64/json/xml/sql/find-replace/crypt open their dialogs', () => {
    const ui = useUiStore()
    menu('tools-base64')
    expect(ui.textTool).toBe('base64')
    menu('tools-json')
    expect(ui.textTool).toBe('json')
    menu('tools-xml')
    expect(ui.textTool).toBe('xml')
    menu('tools-crypt')
    expect(ui.showCryptDialog).toBe(true)
  })

  it('surfaces a format hint for JSON/XML-shaped content and none for plain text', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    store.right = { path: '/tmp/b.txt', name: 'b.txt', content: 'just some text' }
    expect(store.leftFormatHint).toEqual({ kind: 'json', valid: true })
    expect(store.rightFormatHint).toBeNull()
  })

  it('has no format hint for content that is already pretty-printed', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{\n  "a": 1\n}' }
    expect(store.leftFormatHint).toBeNull()
  })

  it('surfaces an invalid-format hint (no Format action) for malformed JSON', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a": 1,}' }
    expect(store.leftFormatHint.kind).toBe('json')
    expect(store.leftFormatHint.valid).toBe(false)
  })

  it('formatSide pretty-prints the content in place', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    store.formatSide('left')
    expect(store.left.content).toBe('{\n  "a": 1\n}')
    expect(store.leftFormatHint).toBeNull() // now pretty, hint clears itself
  })

  it('formatSide is a no-op when the hint is invalid or missing', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a": 1,}' }
    store.formatSide('left')
    expect(store.left.content).toBe('{"a": 1,}') // unchanged, still invalid
    store.formatSide('right') // no right file at all
    expect(store.right).toBeNull()
  })

  it('dismissFormatHint hides the hint until the content changes again', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    expect(store.leftFormatHint).not.toBeNull()
    store.dismissFormatHint('left')
    expect(store.leftFormatHint).toBeNull()
    store.left = { ...store.left, content: '{"b":2}' }
    expect(store.leftFormatHint).not.toBeNull() // new content, dismissal doesn't carry over
  })

  it('merges both sides into one banner with a Format-both action', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    store.right = { path: '/tmp/b.json', name: 'b.json', content: '{"b":2}' }
    const banner = store.formatBanner
    expect(banner.message).toBe('Both sides look like JSON — pretty-print?')
    expect(banner.formatBoth).toBe(true)
    expect(banner.invalid).toBe(false)
    expect(banner.dismissSides).toEqual(['left', 'right'])

    store.formatBoth()
    expect(store.left.content).toBe('{\n  "a": 1\n}')
    expect(store.right.content).toBe('{\n  "b": 2\n}')
    expect(store.formatBanner).toBeNull() // both pretty now, banner clears itself
  })

  it('names the single formattable side when the other is invalid', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    store.right = { path: '/tmp/b.json', name: 'b.json', content: '{"b": 2,}' }
    const banner = store.formatBanner
    expect(banner.formatBoth).toBe(false)
    expect(banner.formatSide).toBe('left')
    expect(banner.formatLabel).toBe('Format Left')
    expect(banner.invalid).toBe(false) // still actionable — the left side can format
    expect(banner.message).toContain("doesn't parse")
  })

  it('is a red, actionless banner when both sides are invalid, and dismiss silences both', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a": 1,}' }
    store.right = { path: '/tmp/b.json', name: 'b.json', content: '{"b": 2,}' }
    const banner = store.formatBanner
    expect(banner.invalid).toBe(true)
    expect(banner.formatBoth).toBe(false)
    expect(banner.formatSide).toBeNull()

    store.dismissFormatHints(banner.dismissSides)
    expect(store.formatBanner).toBeNull()
  })

  it('has no banner when neither side has a hint', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.txt', name: 'a.txt', content: 'plain' }
    expect(store.formatBanner).toBeNull()
  })

  it('save from the menu only opens the dialog when there is something to save', () => {
    const store = useDiffStore()
    menu('save')
    expect(store.showSaveDialog).toBe(false)
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    menu('save')
    expect(store.showSaveDialog).toBe(true)
  })

  it('snapshot/restore round-trips a paste-mode session', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'left text'
    store.pasteRight = 'right text'
    store.ignoreTrimWhitespace = true
    const snap = store.snapshot()

    const fresh = useDiffStore()
    fresh.clear()
    fresh.restore(snap)
    expect(fresh.mode).toBe('paste')
    expect(fresh.pasteLeft).toBe('left text')
    expect(fresh.pasteRight).toBe('right text')
    expect(fresh.ignoreTrimWhitespace).toBe(true)
  })

  it('restore fills in defaults for fields an older saved diff lacks', () => {
    const store = useDiffStore()
    store.restore({ left: FILE('a.txt'), right: FILE('b.txt') })
    expect(store.mode).toBe('files')
    expect(store.pasteLeft).toBe('')
    expect(store.renderSideBySide).toBe(true)
    expect(store.ignoreTrimWhitespace).toBe(false)
  })

  it('formatSide pretty-prints in place, and only when the hint says it is valid', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    store.right = { path: '/tmp/b.json', name: 'b.json', content: '{"a":' } // invalid
    store.formatSide('left')
    store.formatSide('right')
    expect(store.left.content).toBe('{\n  "a": 1\n}')
    expect(store.right.content).toBe('{"a":') // untouched — never mangle bad input
  })

  it('refreshFromDisk reloads a side whose content changed and says so', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    window.api = {
      readFile: async (path) => ({ path, name: 'a.txt', content: 'edited elsewhere' })
    }
    await store.refreshFromDisk()
    expect(store.left.content).toBe('edited elsewhere')
    expect(store.diskNotice).toContain('changed on disk')
  })

  it('refreshFromDisk leaves the last good state when the file is gone', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    window.api = {
      readFile: async () => {
        throw new Error('ENOENT')
      }
    }
    await store.refreshFromDisk()
    expect(store.left.content).toBe('content of a.txt')
  })

  it('swap exchanges the two sides', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.swap()
    expect(store.left.name).toBe('b.txt')
    expect(store.right.name).toBe('a.txt')
  })

  it('clear wipes both sides, the stats and any pasted text', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.stats = { additions: 1, deletions: 2 }
    store.pasteLeft = 'x'
    store.pasteRight = 'y'
    store.clear()
    expect(store.left).toBeNull()
    expect(store.right).toBeNull()
    expect(store.stats).toBeNull()
    expect(store.pasteLeft).toBe('')
    expect(store.pasteRight).toBe('')
  })

  it('dropping two files fills both sides in drop order', async () => {
    const store = useDiffStore()
    window.api = {
      readFile: async (path) => ({ path, name: path.split('/').pop(), content: path })
    }
    await store.dropFiles(['/tmp/one.txt', '/tmp/two.txt'])
    expect(store.left.name).toBe('one.txt')
    expect(store.right.name).toBe('two.txt')
  })

  it('dropping onto a complete comparison asks before discarding it', async () => {
    const store = useDiffStore()
    window.api = {
      readFile: async (path) => ({ path, name: path.split('/').pop(), content: path })
    }
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    await store.dropFiles(['/tmp/new.txt'])
    expect(store.pendingReplace).toEqual(['/tmp/new.txt'])
    expect(store.left.name).toBe('a.txt') // nothing replaced yet

    await store.confirmReplace()
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('new.txt')
    expect(store.right).toBeNull() // waiting for the second file
  })

  it('a single dropped file targets the slot it was dropped on', async () => {
    const store = useDiffStore()
    window.api = {
      readFile: async (path) => ({ path, name: path.split('/').pop(), content: path })
    }
    await store.dropFiles(['/tmp/right.txt'], 'right')
    expect(store.right.name).toBe('right.txt')
    expect(store.left).toBeNull()
  })

  it('showNotice replaces the previous message', () => {
    const store = useDiffStore()
    store.showNotice('first')
    store.showNotice('second')
    expect(store.notice).toBe('second')
  })

  it('identical is true only for two loaded sides whose diff has no changes', () => {
    const store = useDiffStore()
    expect(store.identical).toBe(false) // nothing loaded
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    expect(store.identical).toBe(false) // stats not computed yet
    store.stats = { additions: 2, deletions: 1 }
    expect(store.identical).toBe(false)
    store.stats = { additions: 0, deletions: 0 }
    expect(store.identical).toBe(true)
  })

  it('copyDiff writes a unified patch to the clipboard', async () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.txt', name: 'a.txt', content: 'one\ntwo\nthree\n' }
    store.right = { path: '/tmp/b.txt', name: 'b.txt', content: 'one\nTWO\nthree\n' }
    let copied = null
    window.api.copyText = async (t) => {
      copied = t
      return { ok: true }
    }
    await store.copyDiff()
    expect(copied).toContain('--- a.txt')
    expect(copied).toContain('+++ b.txt')
    expect(copied).toContain('-two')
    expect(copied).toContain('+TWO')
    expect(store.notice).toContain('copied')
  })

  it('copyDiff says the sides are identical instead of copying nothing', async () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.txt', name: 'a.txt', content: 'same\n' }
    store.right = { path: '/tmp/b.txt', name: 'b.txt', content: 'same\n' }
    let called = false
    window.api.copyText = async () => ((called = true), { ok: true })
    await store.copyDiff()
    expect(called).toBe(false)
    expect(store.notice).toContain('identical')
  })

  it('copyDiff refuses when both sides are not loaded', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    await store.copyDiff()
    expect(store.notice).toContain('before copying')
  })

  it('copyDiff refuses a spreadsheet comparison instead of crashing', async () => {
    const store = useDiffStore()
    const sheets = [{ name: 'S1', rows: [['Region', 100]] }]
    store.left = { path: '/tmp/l.xlsx', name: 'l.xlsx', kind: 'spreadsheet', sheets }
    store.right = { path: '/tmp/r.xlsx', name: 'r.xlsx', kind: 'spreadsheet', sheets }
    let called = false
    window.api.copyText = async () => ((called = true), { ok: true })
    await store.copyDiff()
    expect(called).toBe(false)
    expect(store.notice).toContain('text comparisons')
  })

  it('refreshFromDisk coalesces multiple changed files into one notice', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    window.api.readFile = async (path) => ({
      path,
      name: path.split('/').pop(),
      content: `NEW ${path}`
    })
    await store.refreshFromDisk()
    expect(store.left.content).toBe('NEW /tmp/a.txt')
    expect(store.right.content).toBe('NEW /tmp/b.txt')
    expect(store.diskNotice).toBe('2 files changed on disk — diff reloaded.')
  })

  it('refreshFromDisk also follows a partial-paste file and keeps its shape', async () => {
    const store = useDiffStore()
    store.receivePasteFile('left', { name: 'src.txt', content: 'old body', path: '/tmp/src.txt' })
    window.api.readFile = async (path) => ({ path, name: 'src.txt', content: 'fresh body' })
    await store.refreshFromDisk()
    expect(store.pasteLeftFile).toEqual({
      name: 'src.txt',
      content: 'fresh body',
      path: '/tmp/src.txt'
    })
    expect(store.diskNotice).toContain('src.txt')
  })

  it('a partial-paste file without a path is never re-read from disk', async () => {
    const store = useDiffStore()
    store.receivePasteFile('left', { name: 'typed.txt', content: 'x' }) // no path
    let read = false
    window.api.readFile = async () => ((read = true), { error: 'not-permitted' })
    await store.refreshFromDisk()
    expect(read).toBe(false)
    expect(store.pasteLeftFile.content).toBe('x')
  })

  // --- overwrite guard for an active, unsaved comparison ---

  it('opening a file into an unsaved complete comparison asks before replacing', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt') // ready, and never saved
    window.api.openFile = async (side) => ({
      path: `/tmp/new-${side}.txt`,
      name: `new-${side}.txt`,
      content: 'new'
    })
    await store.pick('left')
    expect(store.pendingPick).toMatchObject({ side: 'left' })
    expect(store.left.name).toBe('a.txt') // nothing replaced until confirmed
    store.confirmPick()
    expect(store.left.name).toBe('new-left.txt')
    expect(store.pendingPick).toBeNull()
  })

  it('opening a file into a SAVED comparison replaces it without a prompt', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.markSaved()
    window.api.openFile = async () => ({ path: '/tmp/x.txt', name: 'x.txt', content: 'new' })
    await store.pick('left')
    expect(store.pendingPick).toBeNull()
    expect(store.left.name).toBe('x.txt') // replaced directly — nothing to lose
    expect(store.diffSaved).toBe(false) // and it's unsaved work again
  })

  it('completing an incomplete comparison never prompts', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt') // only one side loaded → not ready
    window.api.openFile = async () => ({ path: '/tmp/b.txt', name: 'b.txt', content: 'x' })
    await store.pick('right')
    expect(store.pendingPick).toBeNull()
    expect(store.right.name).toBe('b.txt')
  })

  it('cancelPick keeps the current comparison', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    window.api.openFile = async () => ({ path: '/tmp/x', name: 'x', content: 'y' })
    await store.pick('left')
    store.cancelPick()
    expect(store.pendingPick).toBeNull()
    expect(store.left.name).toBe('a.txt')
  })

  it('saveThenPick opens the save dialog, then finishPickAfterSave applies the pick', async () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    window.api.openFile = async () => ({ path: '/tmp/x', name: 'x.txt', content: 'y' })
    await store.pick('right')
    store.saveThenPick()
    expect(store.pendingPick).toBeNull()
    expect(store.pickAfterSave).toMatchObject({ side: 'right' })
    expect(store.showSaveDialog).toBe(true)
    store.finishPickAfterSave()
    expect(store.right.name).toBe('x.txt')
    expect(store.pickAfterSave).toBeNull()
  })

  it('drag-drop over a SAVED comparison replaces without prompting', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.markSaved()
    await store.dropFiles(['/tmp/c.txt', '/tmp/d.txt'])
    expect(store.pendingReplace).toBeNull() // no prompt
    expect(store.left.name).toBe('c.txt')
    expect(store.right.name).toBe('d.txt')
  })

  it('restore marks the diff saved; editing a side makes it unsaved again', () => {
    const store = useDiffStore()
    store.restore({ left: FILE('a.txt'), right: FILE('b.txt') })
    expect(store.diffSaved).toBe(true)
    store.receive('left', FILE('c.txt'))
    expect(store.diffSaved).toBe(false)
  })

  it('swap marks the comparison unsaved', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.markSaved()
    store.swap()
    expect(store.diffSaved).toBe(false)
  })

  // The floating quick look-up hands a chosen result here (main forwards
  // { kind, id }); the main window's big view does the actual open.
  it('openFromQuickLook opens a snippet in the editor', async () => {
    const store = useDiffStore()
    await store.openFromQuickLook({ kind: 'snippet', id: 's1' })
    expect(useSnippetStore().editingSnippet).toEqual({ id: 's1' })
  })

  it('openFromQuickLook loads and restores a saved diff', async () => {
    const store = useDiffStore()
    const payload = { mode: 'paste', pasteLeft: 'L', pasteRight: 'R', left: null, right: null }
    window.api.vaultDecrypt = async () => JSON.stringify(payload)
    useVaultStore().entries.push({
      id: 'd1',
      name: 'diff',
      createdAt: Date.now(),
      expiresAt: null,
      from: null,
      favorite: false,
      tags: [],
      iv: 'x',
      data: 'y'
    })
    await store.openFromQuickLook({ kind: 'diff', id: 'd1' })
    expect(store.mode).toBe('paste')
    expect(store.pasteLeft).toBe('L')
    expect(store.pasteRight).toBe('R')
    expect(store.diffSaved).toBe(true)
  })

  it('openFromQuickLook ignores a payload with no id', async () => {
    const store = useDiffStore()
    await store.openFromQuickLook(null)
    await store.openFromQuickLook({ kind: 'snippet' })
    expect(useSnippetStore().editingSnippet).toBeFalsy()
  })
})

// Closing the active tab from the File menu (or Cmd+Shift+W). This wiring was
// once dropped by an unrelated commit and nothing noticed, because nothing
// tested it — the menu item stayed, the action behind it did not.
describe('closing the active comparison from the menu', () => {
  const load = (store) => {
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
  }

  it('asks first when the comparison would be lost', () => {
    const store = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    load(store)
    tabs.syncActiveTitle()

    menu('tab-close')
    expect(tabs.pendingClose).toEqual([tabs.activeId])
    expect(tabs.tabs).toHaveLength(1)

    tabs.confirmClose()
    expect(tabs.pendingClose).toBeNull()
    expect(store.left).toBeNull()
  })

  it('closes a saved or empty comparison without asking', () => {
    const tabs = useTabsStore()
    tabs.init()
    tabs.open({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') }, { diffSaved: true })
    tabs.open({ mode: 'files', left: FILE('c.txt'), right: FILE('d.txt') }, { diffSaved: true })

    menu('tab-close')
    expect(tabs.pendingClose).toBeNull()
    expect(tabs.tabs).toHaveLength(1)

    // A blank tab holds nothing to lose either.
    menu('tab-close')
    expect(tabs.pendingClose).toBeNull()
  })

  it('opens and steps between comparisons from the menu', () => {
    const tabs = useTabsStore()
    tabs.init()
    load(useDiffStore())

    menu('tab-new')
    expect(tabs.tabs).toHaveLength(2)
    const [first, second] = tabs.tabs.map((t) => t.id)
    expect(tabs.activeId).toBe(second)

    menu('tab-next')
    expect(tabs.activeId).toBe(first)
    menu('tab-prev')
    expect(tabs.activeId).toBe(second)
  })
  it('every menu action in the table runs without touching an unmapped one', () => {
    const ui = useUiStore()
    const store = useDiffStore()
    // An unknown action must be a no-op, not a throw: menu strings come from
    // two places (main's menu and MenuBar.vue) and drift is survivable.
    expect(() => menu('no-such-action')).not.toThrow()
    menu('settings')
    expect(ui.showSettingsDialog).toBe(true)
    menu('manage-keys')
    expect(useShareStore().showTrustedKeysDialog).toBe(true)
    menu('export-pubkey')
    expect(useShareStore().showShareKeyDialog).toBe(true)
    menu('config-backup')
    expect(useConfigBackupStore().mode).toBe('backup')
    menu('config-restore')
    expect(useConfigBackupStore().mode).toBe('restore')
    store.left = { name: 'a', content: 'x' }
    store.right = { name: 'b', content: 'y' }
    menu('toggle-split')
    expect(store.renderSideBySide).toBe(false)
  })
})
