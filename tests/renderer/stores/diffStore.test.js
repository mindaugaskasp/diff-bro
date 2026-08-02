import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DISK_NOTICE_MS, useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import {
  elementScroller,
  getDiffScroller,
  setDiffScroller
} from '../../../src/renderer/src/utils/diffScroller'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
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

    it('stays a text comparison until the toggle is on', () => {
      const store = loadCsv(useDiffStore())
      expect(store.comparableKind).toBe('text')
      store.semanticView = true
      expect(store.comparableKind).toBe('spreadsheet')
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

  it('paste-to-compare: confirming reads the clipboard into the first empty side', async () => {
    window.api = { readText: () => Promise.resolve('pasted body') }
    const store = useDiffStore()
    await store.requestPasteFromClipboard()
    expect(store.pastePrompt).toBe('enter')
    await store.confirmPasteEnter()
    expect(store.mode).toBe('paste')
    expect(store.pasteLeft).toBe('pasted body')
    expect(store.pastePrompt).toBeNull()
  })

  it('paste-to-compare: fills the right side when the left already has content', async () => {
    window.api = { readText: () => Promise.resolve('second') }
    const store = useDiffStore()
    store.pasteLeft = 'first'
    await store.confirmPasteEnter()
    expect(store.pasteRight).toBe('second')
    expect(store.pastePrompt).toBeNull()
  })

  it('paste-to-compare: both sides full escalates to the overwrite confirm', async () => {
    window.api = { readText: () => Promise.resolve('third') }
    const store = useDiffStore()
    store.pasteLeft = 'first'
    store.pasteRight = 'second'
    await store.confirmPasteEnter()
    expect(store.pastePrompt).toBe('overwrite')
    expect(store.pasteLeft).toBe('first') // nothing clobbered yet
    store.confirmPasteOverwrite()
    expect(store.pasteLeft).toBe('third') // left replaced, right kept
    expect(store.pasteRight).toBe('second')
    expect(store.pastePrompt).toBeNull()
  })

  it('paste-to-compare: an empty clipboard notices and does not enter a prompt', async () => {
    window.api = { readText: () => Promise.resolve('   ') }
    const store = useDiffStore()
    await store.confirmPasteEnter()
    expect(store.pastePrompt).toBeNull()
    expect(store.notice).toContain('clipboard is empty')
  })

  it('paste-to-compare: with one file loaded, fills the EMPTY side and keeps the file', async () => {
    window.api = { readText: () => Promise.resolve('pasted body') }
    const store = useDiffStore()
    store.left = FILE('a.txt') // files mode, only the left loaded
    await store.confirmPasteEnter()
    expect(store.mode).toBe('files') // stays in files mode, no paste-mode detour
    expect(store.left.name).toBe('a.txt') // loaded file untouched
    expect(store.right).toEqual({ path: null, name: 'Right (pasted)', content: 'pasted body' })
    expect(store.ready).toBe(true) // immediate comparison
    expect(store.pastePrompt).toBeNull()
  })

  it('paste-to-compare: mirrors for a right-only file (pastes into left)', async () => {
    window.api = { readText: () => Promise.resolve('L') }
    const store = useDiffStore()
    store.right = FILE('b.txt')
    await store.confirmPasteEnter()
    expect(store.left).toEqual({ path: null, name: 'Left (pasted)', content: 'L' })
    expect(store.right.name).toBe('b.txt')
  })

  it('paste-to-compare: both files loaded confirms, then overwrite replaces the left file', async () => {
    window.api = { readText: () => Promise.resolve('new left') }
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    await store.confirmPasteEnter()
    expect(store.pastePrompt).toBe('overwrite')
    expect(store.left.name).toBe('a.txt') // nothing clobbered yet
    store.confirmPasteOverwrite()
    expect(store.left).toEqual({ path: null, name: 'Left (pasted)', content: 'new left' })
    expect(store.right.name).toBe('b.txt') // right kept
  })

  it('paste-to-compare: refuses (no prompt) when a spreadsheet is loaded', () => {
    const store = useDiffStore()
    store.left = { name: 'book.xlsx', kind: 'spreadsheet', sheets: [] }
    store.requestPasteFromClipboard()
    expect(store.pastePrompt).toBeNull()
    expect(store.notice).toMatch(/spreadsheet/i)
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

  it('routes menu actions: toggle-split flips the view option', () => {
    const store = useDiffStore()
    const before = store.renderSideBySide
    store.handleMenuAction('toggle-split')
    expect(store.renderSideBySide).toBe(!before)
  })

  it('only opens the save dialog when there is something to save', () => {
    const store = useDiffStore()
    store.handleMenuAction('save')
    expect(store.showSaveDialog).toBe(false)
    store.mode = 'paste'
    store.pasteLeft = 'x'
    store.handleMenuAction('save')
    expect(store.showSaveDialog).toBe(true)
  })

  it('shareCurrent explains itself instead of opening dialogs on an empty app', () => {
    const store = useDiffStore()
    store.shareCurrent()
    expect(store.showSaveDialog).toBe(false)
    expect(store.saveThenShare).toBe(false)
    expect(store.notice).toContain('Nothing to share')
  })

  it('shareCurrent chains save → share when a diff is present', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'x'
    store.shareCurrent()
    expect(store.showSaveDialog).toBe(true)
    expect(store.saveThenShare).toBe(true)
  })

  it('routes menu actions: tools-base64/json/xml/sql/find-replace/crypt open their dialogs', () => {
    const store = useDiffStore()
    store.handleMenuAction('tools-base64')
    expect(store.textTool).toBe('base64')
    store.handleMenuAction('tools-json')
    expect(store.textTool).toBe('json')
    store.handleMenuAction('tools-xml')
    expect(store.textTool).toBe('xml')
    store.handleMenuAction('tools-crypt')
    expect(store.showCryptDialog).toBe(true)
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

  it('defaults to Light and toggleTheme flips the ground, persisting + stamping', () => {
    const store = useDiffStore()
    expect(store.theme).toBe('light') // Light is the default
    store.toggleTheme()
    expect(store.theme).toBe('dark')
    expect(localStorage.getItem('diffbro.theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    store.toggleTheme()
    expect(store.theme).toBe('light')
  })

  it('setTheme applies any named theme and normalizes an unknown one to Light', () => {
    const store = useDiffStore()
    store.setTheme('neon')
    expect(store.theme).toBe('neon')
    expect(document.documentElement.dataset.theme).toBe('neon')
    expect(localStorage.getItem('diffbro.theme')).toBe('neon')
    // Ctrl+D from a dark-ground theme flips to Light.
    store.toggleTheme()
    expect(store.theme).toBe('light')
    store.setTheme('bogus')
    expect(store.theme).toBe('light')
  })

  it('daily rotation overrides the active theme but keeps the saved choice, reverting when off', async () => {
    const { useSettingsStore } = await import('../../../src/renderer/src/stores/settingsStore')
    const settings = useSettingsStore()
    const store = useDiffStore()
    store.setTheme('neon') // the user's saved pick

    settings.setRotateThemeDaily(true)
    store.resolveActiveTheme()
    const { themeForDay } = await import('../../../src/renderer/src/utils/themes')
    expect(store.theme).toBe(themeForDay()) // active is the day's theme
    expect(store.userTheme).toBe('neon') // saved choice untouched

    // Picking a theme while rotating saves it but doesn't override today's theme.
    store.setTheme('solar')
    expect(store.userTheme).toBe('solar')
    expect(store.theme).toBe(themeForDay())

    // Turning rotation off reverts to the saved choice.
    settings.setRotateThemeDaily(false)
    store.resolveActiveTheme()
    expect(store.theme).toBe('solar')
  })

  it('adds a trusted key before clearing the pending state, then opens the manager', async () => {
    const store = useDiffStore()
    const seen = []
    window.api = {
      addTrustedKeyNamed: async (key, label) => {
        // The naming dialog must still be up while the key is being stored —
        // TrustedKeysDialog re-reads its list the moment this clears.
        seen.push(store.pendingTrustedKey?.fingerprint ?? null)
        return { ok: true, label, fingerprint: 'AB:CD', key }
      }
    }
    store.pendingTrustedKey = { key: 'pub', fingerprint: 'AB:CD', label: 'Alice' }
    await store.confirmTrustedKey('Alice — laptop')
    expect(seen).toEqual(['AB:CD'])
    expect(store.pendingTrustedKey).toBeNull()
    expect(store.showTrustedKeysDialog).toBe(true)
    expect(store.notice).toContain('Alice — laptop')
  })

  it('leaves the manager closed when the key could not be added', async () => {
    const store = useDiffStore()
    window.api = { addTrustedKeyNamed: async () => ({ error: 'bad-key' }) }
    store.pendingTrustedKey = { key: 'pub', fingerprint: 'AB:CD', label: 'Alice' }
    await store.confirmTrustedKey('Alice')
    expect(store.pendingTrustedKey).toBeNull()
    expect(store.showTrustedKeysDialog).toBe(false)
  })
  it('every menu action in the table runs without touching an unmapped one', () => {
    const store = useDiffStore()
    // An unknown action must be a no-op, not a throw: menu strings come from
    // two places (main's menu and MenuBar.vue) and drift is survivable.
    expect(() => store.handleMenuAction('no-such-action')).not.toThrow()
    store.handleMenuAction('settings')
    expect(store.showSettingsDialog).toBe(true)
    store.handleMenuAction('manage-keys')
    expect(store.showTrustedKeysDialog).toBe(true)
    store.handleMenuAction('export-pubkey')
    expect(store.showShareKeyDialog).toBe(true)
    store.handleMenuAction('config-backup')
    expect(store.configMode).toBe('backup')
    store.handleMenuAction('config-restore')
    expect(store.configMode).toBe('restore')
    store.handleMenuAction('toggle-split')
    expect(store.renderSideBySide).toBe(false)
  })

  it('save from the menu only opens the dialog when there is something to save', () => {
    const store = useDiffStore()
    store.handleMenuAction('save')
    expect(store.showSaveDialog).toBe(false)
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.handleMenuAction('save')
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

  it('a dropped public key opens the naming dialog instead of loading a diff', async () => {
    const store = useDiffStore()
    window.api = {
      readKeyFile: async () => ({
        ok: true,
        key: { format: 'k', sign: 's', box: 'b' },
        fingerprint: 'AB:CD',
        defaultLabel: 'Alice'
      })
    }
    await store.receiveDroppedKey('/tmp/alice.diffbrokey')
    expect(store.pendingTrustedKey).toMatchObject({ fingerprint: 'AB:CD', label: 'Alice' })
    expect(store.left).toBeNull()
  })

  it('refuses your own key with an explanation rather than adding it', async () => {
    const store = useDiffStore()
    window.api = { readKeyFile: async () => ({ error: 'own-key' }) }
    await store.receiveDroppedKey('/tmp/mine.diffbrokey')
    expect(store.pendingTrustedKey).toBeNull()
    expect(store.notice).toContain('your own public key')
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
  it('key export/copy close the dialog and explain the next step', async () => {
    const store = useDiffStore()
    store.showShareKeyDialog = true
    window.api = { exportPublicKey: async () => ({ ok: true }) }
    await store.runExportKey('Alice — laptop')
    expect(store.showShareKeyDialog).toBe(false)
    expect(store.notice).toContain('Add Trusted Key')

    store.showShareKeyDialog = true
    window.api = { copyPublicKey: async () => ({ ok: true }) }
    await store.runCopyKey('Alice — laptop')
    expect(store.showShareKeyDialog).toBe(false)
    expect(store.notice).toContain('copied')
  })

  it('a cancelled key export leaves the dialog open', async () => {
    const store = useDiffStore()
    store.showShareKeyDialog = true
    window.api = { exportPublicKey: async () => ({ canceled: true }) }
    await store.runExportKey('x')
    expect(store.showShareKeyDialog).toBe(true)
  })

  it('addTrustedKey turns each failure into its own message', async () => {
    const store = useDiffStore()
    window.api = { addTrustedKey: async () => ({ error: 'own-key' }) }
    await store.addTrustedKey()
    expect(store.notice).toContain('your own public key')
    expect(store.pendingTrustedKey).toBeNull()

    window.api = { addTrustedKey: async () => ({ error: 'not-a-key' }) }
    await store.addTrustedKey()
    expect(store.notice).toContain('not a valid public key')

    window.api = { addTrustedKey: async () => ({ canceled: true }) }
    store.notice = null
    await store.addTrustedKey()
    expect(store.notice).toBeNull() // cancelling says nothing
  })

  it('cancelTrustedKey drops the pending key without adding it', () => {
    const store = useDiffStore()
    store.pendingTrustedKey = { key: 'k', fingerprint: 'AB', label: 'Alice' }
    store.cancelTrustedKey()
    expect(store.pendingTrustedKey).toBeNull()
  })

  it('config backup reports where the file went, and names the failure otherwise', async () => {
    const store = useDiffStore()
    window.api = { backupConfig: async () => ({ ok: true, path: '/tmp/cfg.diffbroconf' }) }
    await store.runConfigBackup('passphrase')
    expect(store.notice).toContain('/tmp/cfg.diffbroconf')

    window.api = { backupConfig: async () => ({ error: 'nope' }) }
    await store.runConfigBackup('passphrase')
    expect(store.notice).toBe('Backup failed.')

    window.api = { backupConfig: async () => ({ canceled: true }) }
    store.notice = null
    await store.runConfigBackup('passphrase')
    expect(store.notice).toBeNull()
  })

  it('config restore applies the backed-up theme and distinguishes a wrong passphrase', async () => {
    const store = useDiffStore()
    expect(store.theme).toBe('light')
    window.api = {
      restoreConfig: async () => ({ ok: true, snippets: null, settings: { theme: 'neon' } })
    }
    await store.runConfigRestore('passphrase')
    expect(store.theme).toBe('neon')
    expect(store.notice).toContain('Configuration restored')

    window.api = { restoreConfig: async () => ({ error: 'wrong-passphrase' }) }
    await store.runConfigRestore('nope')
    expect(store.notice).toContain('Wrong passphrase')

    window.api = { restoreConfig: async () => ({ error: 'not-a-config-file' }) }
    await store.runConfigRestore('nope')
    expect(store.notice).toContain('not a Diff Bro configuration backup')
  })

  it('shareCurrent refuses when there is nothing loaded', () => {
    const store = useDiffStore()
    store.shareCurrent()
    expect(store.showSaveDialog).toBe(false)
    expect(store.notice).toContain('Nothing to share yet')
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

  it('receiveDroppedSharedDiff imports a dropped .diffbro and opens it', async () => {
    const store = useDiffStore()
    const createdAt = Date.now() - 5000
    const expiresAt = Date.now() + 5000
    const snapshot = { mode: 'files', left: FILE('l.txt'), right: FILE('r.txt') }
    window.api.shareImportPath = async () => ({
      ok: true,
      from: 'alice',
      entry: { name: 'from-drop', snapshot, createdAt, expiresAt }
    })
    // Minimal vault crypto round-trip so the just-imported entry re-opens.
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    window.api.vaultDecrypt = async (box) => box.data
    await store.receiveDroppedSharedDiff('/tmp/x.diffbro')
    expect(store.left).toMatchObject({ name: 'l.txt' })
    expect(store.right).toMatchObject({ name: 'r.txt' })
    expect(store.diffSaved).toBe(true) // opened from the vault — no unsaved prompt
    expect(store.notice).toContain('from-drop')
  })

  it('receiveDroppedSharedDiff surfaces an import error and opens nothing', async () => {
    const store = useDiffStore()
    window.api.shareImportPath = async () => ({ error: 'not-for-you' })
    await store.receiveDroppedSharedDiff('/tmp/x.diffbro')
    expect(store.left).toBeNull()
    expect(store.notice).toContain('different machine')
  })

  it('importShared opens the imported diff when nothing is on screen', async () => {
    const store = useDiffStore()
    const snapshot = { mode: 'files', left: FILE('l.txt'), right: FILE('r.txt') }
    window.api.shareImport = async () => ({
      ok: true,
      from: 'alice',
      entry: { name: 'menu-import', snapshot, createdAt: Date.now(), expiresAt: Date.now() + 5000 }
    })
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    window.api.vaultDecrypt = async (box) => box.data
    await store.importShared()
    expect(store.left).toMatchObject({ name: 'l.txt' })
    expect(store.right).toMatchObject({ name: 'r.txt' })
    expect(store.diffSaved).toBe(true) // opened from the vault
    expect(store.notice).toContain('Opened')
  })

  it('importShared keeps the current diff and only files the import when one is active', async () => {
    const store = useDiffStore()
    store.left = FILE('mine-a.txt')
    store.right = FILE('mine-b.txt')
    const snapshot = { mode: 'files', left: FILE('l.txt'), right: FILE('r.txt') }
    window.api.shareImport = async () => ({
      ok: true,
      from: 'alice',
      entry: { name: 'menu-import', snapshot, createdAt: Date.now(), expiresAt: Date.now() + 5000 }
    })
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    let decrypted = false
    window.api.vaultDecrypt = async (box) => ((decrypted = true), box.data)
    await store.importShared()
    // The view is untouched and the imported diff was never decrypted/opened.
    expect(store.left).toMatchObject({ name: 'mine-a.txt' })
    expect(decrypted).toBe(false)
    expect(store.notice).toContain('External diffs')
  })

  it('confirmTrustedKey flags the freshly added key so the manager can highlight it', async () => {
    const store = useDiffStore()
    window.api.addTrustedKeyNamed = async (key, label) => ({
      ok: true,
      label,
      fingerprint: 'AB:CD',
      key
    })
    store.pendingTrustedKey = { key: 'pub', fingerprint: 'AB:CD', label: 'Alice' }
    await store.confirmTrustedKey('Alice')
    expect(store.lastAddedTrustedFp).toBe('AB:CD')
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
    const payload = { mode: 'paste', pasteLeft: 'L', pasteRight: 'R', left: null, right: null }
    window.api.vaultDecrypt = async () => JSON.stringify(payload)
    const store = useDiffStore()
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

describe('applyPatch', () => {
  const PATCH = '--- original\n+++ changed\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n'
  const pick = (base, patch) => async (side) =>
    side === 'base'
      ? { path: '/tmp/config.js', name: 'config.js', content: base }
      : { name: 'change.patch', content: patch }

  it('opens base ↔ patched from the chosen files', async () => {
    const store = useDiffStore()
    window.api.openFile = pick('a\nb\nc\n', PATCH)
    await store.applyPatch()
    expect(store.left).toEqual({ path: '/tmp/config.js', name: 'config.js', content: 'a\nb\nc\n' })
    expect(store.right).toEqual({ path: null, name: 'config.js (patched)', content: 'a\nB\nc\n' })
    expect(store.mode).toBe('files')
  })

  it('does nothing when the base pick is cancelled', async () => {
    const store = useDiffStore()
    window.api.openFile = async () => null
    await store.applyPatch()
    expect(store.left).toBeNull()
    expect(store.right).toBeNull()
  })

  it('rejects a file that is not a unified diff without loading anything', async () => {
    const store = useDiffStore()
    window.api.openFile = pick('a\nb\nc\n', 'not a patch')
    await store.applyPatch()
    expect(store.left).toBeNull()
    expect(store.right).toBeNull()
  })
})

describe('exportDiff', () => {
  it('builds a self-contained HTML doc and hands it to the save IPC', async () => {
    const store = useDiffStore()
    store.left = { path: null, name: 'a.js', content: 'a\nb\n' }
    store.right = { path: null, name: 'b.js', content: 'a\nB\n' }
    let sent = null
    window.api.exportDiffHtml = async (payload) => {
      sent = payload
      return { ok: true, path: '/tmp/out.html' }
    }
    await store.exportDiff()
    expect(sent.name).toBe('a.js-vs-b.js')
    expect(sent.html).toContain('<!doctype html>')
    expect(sent.html).toContain('a.js ↔ b.js')
  })

  it('does nothing (no IPC) when there is nothing to compare', async () => {
    const store = useDiffStore()
    let called = false
    window.api.exportDiffHtml = async () => {
      called = true
      return { ok: true }
    }
    await store.exportDiff()
    expect(called).toBe(false)
  })
})

describe('exportImage (saved diffs only)', () => {
  // A .content box for captureRectOf to measure, plus a synchronous rAF so the
  // "wait for Monaco" frames resolve without a real compositor.
  function stageViewer() {
    const el = document.createElement('div')
    el.className = 'content'
    el.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 640 })
    document.body.append(el)
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    return () => el.remove()
  }

  async function savedDiff(payload, name = 'Nightly config') {
    const vault = useVaultStore()
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    window.api.vaultDecrypt = async (box) => box.data
    return vault.save(name, null, payload)
  }

  const CAPTURE = { dataUrl: 'data:image/png;base64,SHOT', width: 1800, height: 1280 }

  it('opens the saved diff, shoots the diff column, and previews the result', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    let rect = null
    let shot = null
    window.api.captureDiffImage = async (r) => {
      rect = r
      // What is on screen AT THE SHOT is the saved diff; afterwards it is not.
      shot = [store.left?.name, store.right?.name]
      return CAPTURE
    }

    await store.exportImage(id)

    expect(shot).toEqual(['a.txt', 'b.txt'])
    expect(rect).toEqual({ x: 260, y: 88, width: 900, height: 640 })
    expect(store.imageEntry).toMatchObject({ id, name: 'Nightly config', ...CAPTURE })
    expect(store.imageCapturing).toBe(false)
    cleanup()
  })

  it('keeps the app out of its own screenshot while the shutter is open', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    let capturingDuringShot = null
    window.api.captureDiffImage = async () => {
      capturingDuringShot = store.imageCapturing
      return CAPTURE
    }
    await store.exportImage(id)
    // App.vue hides the toast and the shortcut bar off this flag — they float
    // inside the captured region, so they must be gone when the shot is taken.
    expect(capturingDuringShot).toBe(true)
    expect(store.imageCapturing).toBe(false)
    cleanup()
  })

  it('waits for frames to pass before capturing, so Monaco has repainted', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    let framesBeforeShot = 0
    let frames = 0
    window.requestAnimationFrame = (cb) => {
      frames++
      setTimeout(cb, 0)
    }
    window.api.captureDiffImage = async () => ((framesBeforeShot = frames), CAPTURE)
    await store.exportImage(id)
    expect(framesBeforeShot).toBeGreaterThan(1)
    cleanup()
  })

  // The reported bug: the picture showed the two files with no highlights at
  // all, so a real difference looked like no difference. Monaco computes the
  // diff in a worker and paints its decorations only when that returns, which
  // is long after the handful of frames the shutter used to count.
  it('waits for Monaco to finish diffing before shooting, not just for frames', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    let frames = 0
    window.requestAnimationFrame = (cb) => {
      frames++
      // DiffViewer bumps this from onDidUpdateDiff; here the worker is slow.
      if (frames === 20) store.diffRevision++
      setTimeout(cb, 0)
    }
    let revisionAtShot = null
    window.api.captureDiffImage = async () => ((revisionAtShot = store.diffRevision), CAPTURE)

    await store.exportImage(id)

    expect(revisionAtShot).toBe(1)
    cleanup()
  })

  // A diff taller than its pane cannot be photographed in one shot, so the
  // export scrolls Monaco and main joins the strips. Without this the picture
  // stopped at the bottom of the visible pane.
  describe('a diff taller than the pane', () => {
    // .content at y=88 h=640, with Monaco starting at y=140 — so 588px of pane
    // under a 52px header.
    function stageTallViewer({ contentHeight }) {
      const pane = document.createElement('div')
      pane.className = 'diff-container'
      pane.getBoundingClientRect = () => ({ top: 140, height: 588 })
      const el = document.createElement('div')
      el.className = 'content'
      el.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 640 })
      el.append(pane)
      document.body.append(el)
      window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
      let scrollTop = 0
      setDiffScroller({
        contentHeight: () => contentHeight,
        viewportHeight: () => 588,
        scrollTop: () => scrollTop,
        scrollTo: (top) => (scrollTop = top)
      })
      return () => {
        el.remove()
        setDiffScroller(null)
      }
    }

    it('scrolls through the diff and stitches the strips into one picture', async () => {
      const cleanup = stageTallViewer({ contentHeight: 1400 })
      const store = useDiffStore()
      const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
      const appended = []
      window.api.captureDiffImage = async () => {
        throw new Error('a tall diff must not be shot in one frame')
      }
      window.api.appendDiffImageSlice = async (rect, reset) => {
        appended.push({ rect, reset, scrolledTo: getDiffScroller().scrollTop() })
        return { ok: true }
      }
      window.api.stitchDiffImage = async () => CAPTURE

      await store.exportImage(id)

      // 1400px of diff over a 588px pane: two full viewports, then a 224px tail
      // shot at the scroll clamp (1400 - 588 = 812) and cropped to its bottom.
      expect(appended.map((a) => a.scrolledTo)).toEqual([0, 588, 812])
      expect(appended.map((a) => a.reset)).toEqual([true, false, false])
      // The header rides on the first strip only, never repeated.
      expect(appended[0].rect).toEqual({ x: 260, y: 88, width: 900, height: 52 + 588 })
      expect(appended[1].rect).toEqual({ x: 260, y: 140, width: 900, height: 588 })
      expect(appended[2].rect).toEqual({ x: 260, y: 140 + 364, width: 900, height: 224 })
      expect(store.imageEntry).toMatchObject({ id, ...CAPTURE, truncated: false })
      cleanup()
    })

    it('puts the reader back where they were when the shutter closes', async () => {
      const cleanup = stageTallViewer({ contentHeight: 1400 })
      const store = useDiffStore()
      const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
      getDiffScroller().scrollTo(300)
      window.api.appendDiffImageSlice = async () => ({ ok: true })
      window.api.stitchDiffImage = async () => CAPTURE
      await store.exportImage(id)
      expect(getDiffScroller().scrollTop()).toBe(300)
      cleanup()
    })

    it('stops slicing at the configured ceiling and admits the picture is cut short', async () => {
      const cleanup = stageTallViewer({ contentHeight: 200_000 })
      const store = useDiffStore()
      const settings = useSettingsStore()
      settings.setMaxExportHeightPx(2940) // five 588px viewports
      const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
      let covered = 0
      window.api.appendDiffImageSlice = async (rect, reset) => {
        covered += reset ? rect.height - 52 : rect.height // the header rides slice one
        return { ok: true }
      }
      window.api.stitchDiffImage = async () => CAPTURE
      await store.exportImage(id)
      expect(covered).toBe(2940)
      expect(store.imageEntry.truncated).toBe(true)
      cleanup()
    })

    // The ceiling is in screen pixels, so the same diff exports the same amount
    // whatever the display scale — expressing it in device pixels made a Retina
    // machine capture half as much as a 1× one from identical settings.
    it('covers the same amount of diff whatever the display scale', async () => {
      const covered = async (dpr) => {
        setActivePinia(createPinia())
        const cleanup = stageTallViewer({ contentHeight: 200_000 })
        window.devicePixelRatio = dpr
        const store = useDiffStore()
        useSettingsStore().setMaxExportHeightPx(2940)
        window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
        window.api.vaultDecrypt = async (box) => box.data
        const id = await useVaultStore().save('t', null, {
          mode: 'files',
          left: FILE('a.txt'),
          right: FILE('b.txt')
        })
        let total = 0
        window.api.appendDiffImageSlice = async (rect, reset) => {
          total += reset ? rect.height - 52 : rect.height
          return { ok: true }
        }
        window.api.stitchDiffImage = async () => CAPTURE
        await store.exportImage(id)
        cleanup()
        return total
      }
      expect(await covered(1)).toBe(await covered(2))
    })

    it('gives up on a refused strip instead of stitching a partial picture', async () => {
      const cleanup = stageTallViewer({ contentHeight: 1400 })
      const store = useDiffStore()
      const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
      let stitched = false
      window.api.appendDiffImageSlice = async (_r, reset) =>
        reset ? { ok: true } : { error: 'bad-rect' }
      window.api.stitchDiffImage = async () => ((stitched = true), CAPTURE)
      await store.exportImage(id)
      expect(stitched).toBe(false)
      expect(store.imageEntry).toBeNull()
      expect(store.notice).toContain('Could not take a picture')
      cleanup()
    })
  })

  // Exporting what's on screen, with lines selected in either pane narrowing the
  // picture to just those.
  describe('exportCurrentImage', () => {
    function stageSelectable({ contentHeight, selection }) {
      const pane = document.createElement('div')
      pane.className = 'diff-container'
      pane.getBoundingClientRect = () => ({ top: 140, height: 588 })
      const el = document.createElement('div')
      el.className = 'content'
      el.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 640 })
      el.append(pane)
      document.body.append(el)
      window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
      let scrollTop = 0
      setDiffScroller({
        contentHeight: () => contentHeight,
        viewportHeight: () => 588,
        scrollTop: () => scrollTop,
        scrollTo: (top) => (scrollTop = top),
        selection: () => selection
      })
      return () => {
        el.remove()
        setDiffScroller(null)
      }
    }

    const loaded = (store) => {
      store.left = FILE('a.txt')
      store.right = FILE('b.txt')
      store.mode = 'files'
    }

    it('captures only the selected band, not the whole diff', async () => {
      const cleanup = stageSelectable({
        contentHeight: 4000,
        selection: { top: 1000, bottom: 1300 }
      })
      const store = useDiffStore()
      loaded(store)
      const rects = []
      window.api.appendDiffImageSlice = async (rect, reset) => (
        rects.push({ rect, reset }),
        { ok: true }
      )
      window.api.stitchDiffImage = async () => CAPTURE
      window.api.captureDiffImage = async () => {
        throw new Error('a selection must not fall back to the whole-column shot')
      }

      await store.exportCurrentImage()

      expect(rects).toHaveLength(1)
      // Scrolled to the top of the selection; the header rides above it.
      expect(rects[0]).toEqual({
        rect: { x: 260, y: 88, width: 900, height: 52 + 300 },
        reset: true
      })
      expect(store.imageEntry).toMatchObject({ id: null, name: 'a.txt ↔ b.txt' })
      cleanup()
    })

    it('reaches a selection at the very end through Monaco’s scroll clamp', async () => {
      const cleanup = stageSelectable({
        contentHeight: 4000,
        selection: { top: 3800, bottom: 4000 }
      })
      const store = useDiffStore()
      loaded(store)
      const rects = []
      window.api.appendDiffImageSlice = async (rect) => (rects.push(rect), { ok: true })
      window.api.stitchDiffImage = async () => CAPTURE
      await store.exportCurrentImage()
      // 4000 - 588 = 3412 is as far as it scrolls, so the band sits 388px down.
      expect(getDiffScroller().scrollTop()).toBe(0) // and it is put back after
      expect(rects[0].height).toBe(52 + 200)
      cleanup()
    })

    it('captures the whole diff when no lines are selected', async () => {
      const cleanup = stageSelectable({ contentHeight: 300, selection: null })
      const store = useDiffStore()
      loaded(store)
      let rect = null
      window.api.captureDiffImage = async (r) => ((rect = r), CAPTURE)
      await store.exportCurrentImage()
      expect(rect).toEqual({ x: 260, y: 88, width: 900, height: 640 })
      expect(store.imageEntry).toMatchObject({ id: null })
      cleanup()
    })

    it('refuses when there is no comparison on screen', async () => {
      const cleanup = stageSelectable({ contentHeight: 300, selection: null })
      const store = useDiffStore()
      store.mode = 'paste'
      let called = false
      window.api.captureDiffImage = async () => ((called = true), CAPTURE)
      await store.exportCurrentImage()
      expect(called).toBe(false)
      expect(store.imageEntry).toBeNull()
      expect(store.notice).toContain('Nothing to export')
      cleanup()
    })
  })

  it('exports nothing for an id that is not a saved diff', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    // The live comparison is deliberately NOT a source: saved diffs only.
    store.left = FILE('onscreen.txt')
    store.right = FILE('other.txt')
    let called = false
    window.api.captureDiffImage = async () => ((called = true), CAPTURE)
    await store.exportImage('no-such-id')
    expect(store.imageEntry).toBeNull()
    expect(called).toBe(false)
    cleanup()
  })

  it('shoots the SAVED entry, never whatever was already on screen', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({
      mode: 'files',
      left: FILE('saved-l.txt'),
      right: FILE('saved-r.txt')
    })
    store.left = FILE('onscreen-l.txt')
    store.right = FILE('onscreen-r.txt')
    store.diffSaved = false
    let shot = null
    window.api.captureDiffImage = async () => {
      shot = [store.left?.name, store.right?.name]
      return CAPTURE
    }
    await store.exportImage(id)
    expect(shot).toEqual(['saved-l.txt', 'saved-r.txt'])
    // ...and the comparison the user was working on is handed straight back.
    expect(store.left).toMatchObject({ name: 'onscreen-l.txt' })
    expect(store.right).toMatchObject({ name: 'onscreen-r.txt' })
    expect(store.diffSaved).toBe(false)
    cleanup()
  })

  it('reports an entry that no longer decrypts and photographs nothing', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    window.api.vaultDecrypt = async () => null
    let called = false
    window.api.captureDiffImage = async () => ((called = true), CAPTURE)
    await store.exportImage(id)
    expect(called).toBe(false)
    expect(store.imageEntry).toBeNull()
    expect(store.notice).toContain('expired or could not be decrypted')
    cleanup()
  })

  it('reports a refused capture instead of opening an empty preview', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    window.api.captureDiffImage = async () => ({ error: 'bad-rect' })
    await store.exportImage(id)
    expect(store.imageEntry).toBeNull()
    expect(store.imageCapturing).toBe(false)
    expect(store.notice).toContain('Could not take a picture')
    cleanup()
  })

  it('does not call main when there is no diff column to measure', async () => {
    const store = useDiffStore()
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    let called = false
    window.api.captureDiffImage = async () => ((called = true), CAPTURE)
    await store.exportImage(id) // no .content element staged
    expect(called).toBe(false)
    expect(store.imageEntry).toBeNull()
    expect(store.notice).toContain('Could not take a picture')
  })

  it('copyImage asks main for the capture it is holding, and acknowledges', async () => {
    const store = useDiffStore()
    let called = 0
    window.api.copyDiffImage = async (...args) => {
      called++
      // No image bytes travel back to main — it still has the bitmap.
      expect(args).toHaveLength(0)
      return { ok: true }
    }
    expect(await store.copyImage()).toBe(true)
    expect(called).toBe(1)
    expect(store.notice).toContain('copied to clipboard')
  })

  it('copyImage reports a refusal rather than claiming success', async () => {
    const store = useDiffStore()
    window.api.copyDiffImage = async () => ({ ok: false, error: 'nothing-captured' })
    expect(await store.copyImage()).toBe(false)
    expect(store.notice).toContain('Could not copy')
  })

  it('saveImage names the file after the saved diff and says where it landed', async () => {
    const store = useDiffStore()
    store.imageEntry = { id: 'x', name: 'Nightly config' }
    let sentName = null
    window.api.saveDiffImage = async (name) => {
      sentName = name
      return { ok: true, path: '/tmp/Nightly config.png' }
    }
    await store.saveImage()
    expect(sentName).toBe('Nightly config')
    expect(store.notice).toContain('/tmp/Nightly config.png')
  })

  it('saveImage stays quiet when the save dialog was cancelled', async () => {
    const store = useDiffStore()
    window.api.saveDiffImage = async () => ({ canceled: true })
    await store.saveImage()
    expect(store.notice).toBeNull()
  })

  it('saveImage surfaces a failed write', async () => {
    const store = useDiffStore()
    window.api.saveDiffImage = async () => ({ ok: false, error: 'nothing-captured' })
    await store.saveImage()
    expect(store.notice).toContain('Could not save')
  })

  it('closing the preview tells main to drop the bitmap it was holding', async () => {
    const store = useDiffStore()
    let forgotten = false
    window.api.forgetDiffImage = async () => ((forgotten = true), { ok: true })
    store.imageEntry = { id: 'x', name: 'n', dataUrl: 'data:image/png;base64,SHOT' }
    store.closeImageExport()
    expect(store.imageEntry).toBeNull()
    expect(forgotten).toBe(true)
  })
})

describe('exportImage failure handling', () => {
  it('never leaves the app chrome hidden when the capture throws', async () => {
    const store = useDiffStore()
    const vault = useVaultStore()
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    window.api.vaultDecrypt = async (box) => box.data
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    const el = document.createElement('div')
    el.className = 'content'
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 640 })
    document.body.append(el)
    const id = await vault.save('boom', null, {
      mode: 'files',
      left: FILE('a.txt'),
      right: FILE('b.txt')
    })
    window.api.captureDiffImage = async () => {
      throw new Error('IPC exploded')
    }

    await store.exportImage(id)

    // A stuck flag would hide the shortcut bar for the rest of the session.
    expect(store.imageCapturing).toBe(false)
    expect(store.imageEntry).toBeNull()
    expect(store.notice).toContain('Could not take a picture')
    el.remove()
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

    store.handleMenuAction('tab-close')
    expect(store.pendingTabClose).toEqual([tabs.activeId])
    expect(tabs.tabs).toHaveLength(1)

    store.confirmTabClose()
    expect(store.pendingTabClose).toBeNull()
    expect(store.left).toBeNull()
  })

  it('closes a saved or empty comparison without asking', () => {
    const store = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    tabs.open({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') }, { diffSaved: true })
    tabs.open({ mode: 'files', left: FILE('c.txt'), right: FILE('d.txt') }, { diffSaved: true })

    store.handleMenuAction('tab-close')
    expect(store.pendingTabClose).toBeNull()
    expect(tabs.tabs).toHaveLength(1)

    // A blank tab holds nothing to lose either.
    store.handleMenuAction('tab-close')
    expect(store.pendingTabClose).toBeNull()
  })

  it('opens and steps between comparisons from the menu', () => {
    const store = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    load(store)

    store.handleMenuAction('tab-new')
    expect(tabs.tabs).toHaveLength(2)
    const [first, second] = tabs.tabs.map((t) => t.id)
    expect(tabs.activeId).toBe(second)

    store.handleMenuAction('tab-next')
    expect(tabs.activeId).toBe(first)
    store.handleMenuAction('tab-prev')
    expect(tabs.activeId).toBe(second)
  })
})

// "Saved" is what silences the discard prompts, so a comparison that no longer
// matches the vault copy must stop claiming to be it.
describe('staying honest about what is saved', () => {
  const FILE_AT = (name, content) => ({ path: `/tmp/${name}`, name, content })

  it('a file changing on disk makes the reloaded comparison unsaved again', async () => {
    const store = useDiffStore()
    store.left = FILE_AT('a.txt', 'before')
    store.right = FILE_AT('b.txt', 'other')
    store.markSaved()
    window.api = {
      readFile: async (path) =>
        path.endsWith('a.txt')
          ? { path, name: 'a.txt', content: 'edited elsewhere' }
          : { path, name: 'b.txt', content: 'other' }
    }

    await store.refreshFromDisk()
    expect(store.left.content).toBe('edited elsewhere')
    expect(store.diffSaved).toBe(false)
  })

  it('leaves a diff alone when nothing on disk actually changed', async () => {
    const store = useDiffStore()
    store.left = FILE_AT('a.txt', 'same')
    store.markSaved()
    window.api = { readFile: async (path) => ({ path, name: 'a.txt', content: 'same' }) }

    await store.refreshFromDisk()
    expect(store.diffSaved).toBe(true)
  })
})

// Copied files land exactly like dropped ones, confirm included.
describe('pasting copied files', () => {
  const AT = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })

  it('asks before it replaces a complete, unsaved comparison', async () => {
    const store = useDiffStore()
    store.left = AT('old-left.txt')
    store.right = AT('old-right.txt')
    window.api = {
      readClipboardFiles: async () => [AT('new-left.txt'), AT('new-right.txt')],
      readFile: async (path) => AT(path.split('/').pop())
    }

    await store.requestPasteFromClipboard()
    // What matters is that it WAITS, holding both incoming files, and has not
    // touched the comparison on screen — not how the pending pair is carried.
    expect(store.pendingReplace).toHaveLength(2)
    expect(store.pendingReplace.map((f) => f.name)).toEqual(['new-left.txt', 'new-right.txt'])
    expect(store.left.name).toBe('old-left.txt')

    await store.confirmReplace()
    expect(store.left.name).toBe('new-left.txt')
    expect(store.right.name).toBe('new-right.txt')
  })

  it('replaces a SAVED comparison without asking, like a drop does', async () => {
    const store = useDiffStore()
    store.left = AT('old-left.txt')
    store.right = AT('old-right.txt')
    store.markSaved()
    window.api = {
      readClipboardFiles: async () => [AT('new-left.txt'), AT('new-right.txt')],
      readFile: async (path) => AT(path.split('/').pop())
    }

    await store.requestPasteFromClipboard()
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('new-left.txt')
  })

  it('still fills the free side straight away when nothing would be lost', async () => {
    const store = useDiffStore()
    store.left = AT('kept.txt')
    window.api = {
      readClipboardFiles: async () => [AT('second.txt')],
      readFile: async (path) => AT(path.split('/').pop())
    }

    await store.requestPasteFromClipboard()
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('kept.txt')
    expect(store.right.name).toBe('second.txt')
  })
})

// The change check compared `content`, which a spreadsheet has none of, so no
// workbook ever reloaded.
describe('following a spreadsheet on disk', () => {
  const book = (v) => ({
    path: '/tmp/book.xlsx',
    name: 'book.xlsx',
    kind: 'spreadsheet',
    sheets: [{ name: 'S1', rows: [['a', v]] }]
  })

  it('reloads a workbook whose grid changed, and says so', async () => {
    const store = useDiffStore()
    store.left = book(1)
    store.markSaved()
    window.api = { readFile: async () => book(2) }

    await store.refreshFromDisk()
    expect(store.left.sheets[0].rows[0][1]).toBe(2)
    expect(store.diskNotice).toContain('changed on disk')
    expect(store.diffSaved).toBe(false)
  })

  it('leaves an untouched workbook alone', async () => {
    const store = useDiffStore()
    store.left = book(1)
    store.markSaved()
    window.api = { readFile: async () => book(1) }

    await store.refreshFromDisk()
    expect(store.diskNotice).toBeNull()
    expect(store.diffSaved).toBe(true)
  })
})

// A second save adds nothing but a duplicate row, so it is not offered.
describe('saving the same comparison twice', () => {
  it('is not offered while the comparison on screen is already saved', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    expect(store.hasUnsavedWork).toBe(true)

    store.markSaved()
    expect(store.canSave).toBe(true) // there is still a comparison to share
    expect(store.hasUnsavedWork).toBe(false)

    store.handleMenuAction('save')
    expect(store.showSaveDialog).toBe(false)
  })

  it('is offered again the moment the comparison changes', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.markSaved()

    store.swap()
    expect(store.hasUnsavedWork).toBe(true)
  })

  it('is never offered for an empty comparison', () => {
    expect(useDiffStore().hasUnsavedWork).toBe(false)
  })
})

// Format rewrites a side in memory, so the app's copy and the file diverge. The
// focus re-read saw a difference it had caused itself, threw the formatting
// away, and reported a disk change that never happened.
describe('when the app and the disk have both moved', () => {
  const UGLY = '{"a":1}'
  const onDisk = (content) => ({ path: '/tmp/a.json', name: 'a.json', content })

  it('keeps a side the app reformatted, and does not claim the disk changed', async () => {
    const store = useDiffStore()
    store.left = onDisk(UGLY)
    store.formatSide('left')
    const formatted = store.left.content
    expect(formatted).not.toBe(UGLY)

    window.api = { readFile: async () => onDisk(UGLY) }
    await store.refreshFromDisk()

    expect(store.left.content).toBe(formatted)
    expect(store.diskNotice).toBeNull()
  })

  it('holds the app’s copy when the file ALSO changed, and says which', async () => {
    const store = useDiffStore()
    store.left = onDisk(UGLY)
    store.formatSide('left')
    const formatted = store.left.content

    window.api = { readFile: async () => onDisk('{"a":2}') }
    await store.refreshFromDisk()

    expect(store.left.content).toBe(formatted)
    expect(store.diskNotice).toContain('a.json')
    expect(store.diskNotice).toContain('changed on disk')
    expect(store.diskNotice).toContain('kept')
  })

  it('follows the disk again once the side is reloaded from it', async () => {
    const store = useDiffStore()
    store.left = onDisk(UGLY)
    store.formatSide('left')

    // Re-picking the file is the deliberate "take theirs".
    store.receive('left', onDisk('{"a":2}'))
    window.api = { readFile: async () => onDisk('{"a":3}') }
    await store.refreshFromDisk()

    expect(store.left.content).toBe('{"a":3}')
    expect(store.diskNotice).toContain('diff reloaded')
  })

  it('still reloads an untouched side while another is held back', async () => {
    const store = useDiffStore()
    store.left = onDisk(UGLY)
    store.formatSide('left')
    store.right = { path: '/tmp/b.json', name: 'b.json', content: 'old' }

    window.api = {
      readFile: async (path) =>
        path.endsWith('a.json') ? onDisk('{"a":9}') : { ...store.right, content: 'new' }
    }
    await store.refreshFromDisk()

    expect(store.right.content).toBe('new')
    expect(store.diskNotice).toContain('a.json')
    expect(store.diskNotice).toContain('b.json')
  })
})

// A held, dismissible label — not a toast that clears itself out from under you.
describe('the file-changed label', () => {
  const onDisk = (content) => ({ path: '/tmp/a.txt', name: 'a.txt', content })

  it('goes up on a disk change and clears itself after its window', async () => {
    vi.useFakeTimers()
    try {
      const store = useDiffStore()
      store.left = onDisk('before')
      window.api = { readFile: async () => onDisk('after') }

      await store.refreshFromDisk()
      expect(store.diskNotice).toContain('a.txt')

      vi.advanceTimersByTime(DISK_NOTICE_MS - 1)
      expect(store.diskNotice).not.toBeNull()
      vi.advanceTimersByTime(1)
      expect(store.diskNotice).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('outlives the ordinary toast, which would have cleared first', () => {
    expect(DISK_NOTICE_MS).toBeGreaterThan(5000)
  })

  it('can be dismissed by hand, and stays dismissed', () => {
    vi.useFakeTimers()
    try {
      const store = useDiffStore()
      store.showDiskNotice('"a.txt" changed on disk — diff reloaded.')
      store.dismissDiskNotice()
      expect(store.diskNotice).toBeNull()

      // The timer it cancelled cannot come back and blank a later one.
      store.showDiskNotice('second')
      vi.advanceTimersByTime(DISK_NOTICE_MS - 1)
      expect(store.diskNotice).toBe('second')
    } finally {
      vi.useRealTimers()
    }
  })
})

// The grid scrolls inside itself with no scroller to drive, so the shutter could
// only ever catch the visible slice. Refused outright rather than truncated.
describe('image export and the spreadsheet grid', () => {
  const SHOT = { dataUrl: 'data:image/png;base64,GRID', width: 900, height: 1800 }
  // jsdom's scroll metrics are read-only getters that always answer 0.
  const sizeOf = (el, dims) => {
    for (const [k, value] of Object.entries(dims)) Object.defineProperty(el, k, { value })
  }
  const grid = (name) => ({
    path: `/tmp/${name}`,
    name,
    kind: 'spreadsheet',
    sheets: [{ name: 'S1', rows: [['a', 1]] }]
  })

  // The grid scrolls inside itself with no Monaco behind it. It registers its
  // own scroller, which is all the export needs — scroll a viewport at a time
  // and stitch, exactly as for a tall diff.
  it('is offered for a spreadsheet comparison', () => {
    const store = useDiffStore()
    store.left = grid('a.xlsx')
    store.right = grid('b.xlsx')
    expect(store.isSpreadsheet).toBe(true)
    expect(store.canExportImage).toBe(true)
  })

  it('is still offered for a text comparison', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    expect(store.isSpreadsheet).toBe(false)
    expect(store.canExportImage).toBe(true)
  })

  it('scrolls and stitches the grid the way it does a tall diff', async () => {
    const store = useDiffStore()
    store.left = grid('a.xlsx')
    store.right = grid('b.xlsx')

    const grids = document.createElement('div')
    grids.getBoundingClientRect = () => ({ top: 140, height: 600 })
    sizeOf(grids, { scrollHeight: 1800, clientHeight: 600, scrollWidth: 900, clientWidth: 900 })
    const column = document.createElement('div')
    column.className = 'content'
    column.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 700 })
    column.append(grids)
    document.body.append(column)
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    setDiffScroller(elementScroller(() => grids))

    const tops = []
    window.api.appendDiffImageSlice = async (rect) => {
      tops.push(rect.y)
      return { ok: true }
    }
    window.api.stitchDiffImage = async () => SHOT

    await store.exportCurrentImage()

    expect(tops).toHaveLength(3)
    expect(store.imageEntry).toMatchObject({ ...SHOT, hiddenColumns: 0 })
    column.remove()
    setDiffScroller(null)
  })

  // A grid wider than the window loses its right-hand columns to a picture that
  // only scrolls down. The dialog is told, rather than handing over a crop that
  // looks complete.
  it('reports the columns a picture cannot reach', async () => {
    const store = useDiffStore()
    store.left = grid('a.xlsx')
    store.right = grid('b.xlsx')

    const grids = document.createElement('div')
    grids.getBoundingClientRect = () => ({ top: 140, height: 600 })
    sizeOf(grids, { scrollHeight: 600, clientHeight: 600, scrollWidth: 2700, clientWidth: 900 })
    const column = document.createElement('div')
    column.className = 'content'
    column.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 700 })
    column.append(grids)
    document.body.append(column)
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    setDiffScroller(elementScroller(() => grids))
    window.api.captureDiffImage = async () => SHOT

    await store.exportCurrentImage()

    expect(store.imageEntry?.hiddenColumns).toBe(2)
    column.remove()
    setDiffScroller(null)
  })
})

// A file past the streamed threshold arrives as a descriptor with no `content`.
const BIG = (name) => ({ path: `/big/${name}`, name, size: 60 * 1024 * 1024, kind: 'streamed' })

function loadStreamed(store) {
  store.receive('left', BIG('left.log'))
  store.receive('right', BIG('right.log'))
  return store
}

describe('diffStore — streamed comparisons', () => {
  it('accepts a streamed descriptor into a slot', () => {
    const store = loadStreamed(useDiffStore())
    expect(store.ready).toBe(true)
    expect(store.notice).toBeNull()
    expect(store.leftComparable).toEqual({
      kind: 'streamed',
      path: '/big/left.log',
      name: 'left.log',
      size: 60 * 1024 * 1024
    })
  })

  it('routes to the streamed viewer', () => {
    expect(loadStreamed(useDiffStore()).comparableKind).toBe('streamed')
    expect(loadStreamed(useDiffStore()).isStreamed).toBe(true)
  })

  // One side too large makes the WHOLE comparison streamed — there is no text
  // for the other side to be diffed against in an editor model.
  it('is streamed when only the RIGHT side is too large', () => {
    const store = useDiffStore()
    store.receive('left', FILE('small.txt'))
    store.receive('right', BIG('huge.log'))
    expect(store.comparableKind).toBe('streamed')
  })

  it('is streamed when only the LEFT side is too large', () => {
    const store = useDiffStore()
    store.receive('left', BIG('huge.log'))
    store.receive('right', FILE('small.txt'))
    expect(store.comparableKind).toBe('streamed')
  })

  it('leaves an ordinary comparison on the text viewer', () => {
    const store = useDiffStore()
    store.receive('left', FILE('a.txt'))
    store.receive('right', FILE('b.txt'))
    expect(store.comparableKind).toBe('text')
    expect(store.isStreamed).toBe(false)
  })

  it('refuses to save, which would keep a copy of both files', () => {
    const store = loadStreamed(useDiffStore())
    expect(store.canSave).toBe(false)
  })

  it('refuses to share, since sharing goes through saving', () => {
    const store = loadStreamed(useDiffStore())
    store.shareCurrent()
    expect(store.showSaveDialog).toBe(false)
    expect(store.notice).toBeTruthy()
  })

  it('refuses to copy a patch, naming the reason', async () => {
    const store = loadStreamed(useDiffStore())
    let copied = false
    window.api.copyText = async () => {
      copied = true
      return { ok: true }
    }
    await store.copyDiff()
    expect(copied).toBe(false)
    expect(store.notice).toContain('Too large to copy as a patch')
  })

  it('refuses an HTML export, naming the reason', async () => {
    const store = loadStreamed(useDiffStore())
    let exported = false
    window.api.exportDiffHtml = async () => {
      exported = true
      return { ok: true }
    }
    await store.exportDiff()
    expect(exported).toBe(false)
    expect(store.notice).toContain('Too large to export')
  })

  // Deliberately still allowed: the streamed viewer registers a scroller, so a
  // picture of what is on screen is a real picture.
  it('still allows an image export', () => {
    expect(loadStreamed(useDiffStore()).canExportImage).toBe(true)
  })

  it('refuses a streamed file dropped into a paste side', () => {
    const store = useDiffStore()
    store.receivePasteFile('left', BIG('huge.log'))
    expect(store.pasteLeftFile).toBeNull()
    expect(store.notice).toContain('too large to paste against')
  })

  it('knows a streamed pair needs two files on disk', () => {
    const store = loadStreamed(useDiffStore())
    expect(store.streamedPairReady).toBe(true)
    store.right = { path: null, name: 'Right (pasted)', content: 'typed' }
    expect(store.streamedPairReady).toBe(false)
  })

  // The streamed viewer opens a session from BOTH paths. A mixed pair reads as
  // streamed, but the small side's comparable is an ordinary text one carrying
  // no path — so the paths must come from the loaded files, not the comparables.
  it('exposes both paths for a mixed streamed/ordinary pair', () => {
    const store = useDiffStore()
    store.receive('left', BIG('huge.log'))
    store.receive('right', FILE('small.txt'))
    expect(store.isStreamed).toBe(true)
    expect(store.rightComparable.path).toBeUndefined()
    expect(store.streamedPairReady).toBe(true)
    expect([store.left.path, store.right.path]).toEqual(['/big/huge.log', '/tmp/small.txt'])
  })

  it('is not pair-ready when a streamed side sits opposite pasted text', () => {
    const store = useDiffStore()
    store.receive('left', BIG('huge.log'))
    store.right = { path: null, name: 'Right (pasted)', content: 'typed' }
    expect(store.isStreamed).toBe(true)
    expect(store.streamedPairReady).toBe(false)
  })

  it('keeps saving available once the streamed side is cleared', () => {
    const store = loadStreamed(useDiffStore())
    expect(store.canSave).toBe(false)
    store.receive('left', FILE('a.txt'))
    store.receive('right', FILE('b.txt'))
    expect(store.canSave).toBe(true)
  })
})

// clipboard:readFiles already reads each file through the same path file:read
// uses, so re-reading by path put the "Large file — load anyway?" prompt in
// front of the user twice for one paste.
describe('pasteClipboardFiles', () => {
  it('uses the file objects it was handed instead of reading them again', async () => {
    const store = useDiffStore()
    const readFile = vi.fn(async (path) => ({ path, name: path.split('/').pop(), content: 'x' }))
    window.api = {
      readFile,
      readClipboardFiles: async () => [FILE('a.txt'), FILE('b.txt')]
    }

    expect(await store.pasteClipboardFiles()).toBe(true)
    expect(readFile).not.toHaveBeenCalled()
    expect(store.left.name).toBe('a.txt')
    expect(store.right.name).toBe('b.txt')
  })

  it('is false, and touches nothing, when the clipboard holds no files', async () => {
    const store = useDiffStore()
    window.api = { readClipboardFiles: async () => [] }
    expect(await store.pasteClipboardFiles()).toBe(false)
    expect(store.left).toBeNull()
  })

  it('drops entries the main process refused to read', async () => {
    const store = useDiffStore()
    window.api = {
      readClipboardFiles: async () => [null, FILE('only.txt')]
    }
    expect(await store.pasteClipboardFiles()).toBe(true)
    expect(store.left.name).toBe('only.txt')
    expect(store.right).toBeNull()
  })
})

// Exporting a picture of a SAVED diff must not take the live document hostage:
// it used to replace it, mark it saved (so no discard prompt could fire), and
// leave the tab claiming to hold a comparison it no longer had.
describe('exportImage', () => {
  const seedEntry = async (store) => {
    const vault = useVaultStore()
    vault.entries = [{ id: 'e1', name: 'saved one' }]
    vault.load = async () => ({
      mode: 'files',
      left: FILE('old-left.txt'),
      right: FILE('old-right.txt')
    })
    store._shoot = async () => ({ dataUrl: 'data:image/png;base64,zzz' })
    return vault
  }

  it('leaves unsaved work on screen exactly as it was', async () => {
    const store = useDiffStore()
    await seedEntry(store)
    store.mode = 'paste'
    store.pasteLeft = 'work in progress'
    store.pasteRight = 'other side'
    store.diffSaved = false

    await store.exportImage('e1')

    expect(store.mode).toBe('paste')
    expect(store.pasteLeft).toBe('work in progress')
    expect(store.pasteRight).toBe('other side')
    expect(store.diffSaved).toBe(false)
    expect(store.imageEntry).toMatchObject({ id: 'e1', name: 'saved one' })
  })

  it('restores a loaded file comparison, not just paste text', async () => {
    const store = useDiffStore()
    await seedEntry(store)
    store.left = FILE('live-left.txt')
    store.right = FILE('live-right.txt')
    store.diffSaved = false

    await store.exportImage('e1')

    expect(store.left.name).toBe('live-left.txt')
    expect(store.right.name).toBe('live-right.txt')
    expect(store.diffSaved).toBe(false)
  })

  it('puts the live document back even when the shot fails', async () => {
    const store = useDiffStore()
    await seedEntry(store)
    store._shoot = async () => ({ error: 'capture-failed' })
    store.mode = 'paste'
    store.pasteLeft = 'work in progress'
    store.diffSaved = false

    await store.exportImage('e1')

    expect(store.pasteLeft).toBe('work in progress')
    expect(store.diffSaved).toBe(false)
    expect(store.imageEntry).toBeNull()
    expect(store.notice).toBeTruthy()
  })
})
