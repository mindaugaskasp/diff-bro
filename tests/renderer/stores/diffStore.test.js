import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'

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

  it('refuses a spreadsheet dropped into paste mode', () => {
    const store = useDiffStore()
    store.receivePasteFile('left', { name: 'book.xlsx', kind: 'spreadsheet', sheets: [] })
    expect(store.pasteLeftFile).toBeNull()
    expect(store.notice).toContain('book.xlsx')
  })

  it('paste-to-compare: confirming reads the clipboard into the first empty side', async () => {
    window.api = { readText: () => Promise.resolve('pasted body') }
    const store = useDiffStore()
    store.requestPasteFromClipboard()
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
    expect(store.notice).toContain('changed on disk')
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
    expect(store.notice).toBe('2 files changed on disk — diff reloaded.')
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
    expect(store.notice).toContain('src.txt')
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
