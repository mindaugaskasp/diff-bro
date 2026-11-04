import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import {
  FILE_TYPE_LIMITS,
  MAX_SNIPPET_SIZE_KB_CAP,
  DEFAULT_MAX_EXPORT_HEIGHT_PX,
  MAX_EXPORT_HEIGHT_PX_CAP,
  MIN_EXPORT_HEIGHT_PX
} from '../../../src/renderer/src/utils/settingsDefaults'
import { MAX_RECENT_TOOLS, TOOLS, recentTools } from '../../../src/renderer/src/utils/tools'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('settingsStore', () => {
  it('starts from safe defaults', () => {
    const s = useSettingsStore()
    expect(s.fileSizeLimitMb('text')).toBe(FILE_TYPE_LIMITS.text.default)
    expect(s.fileSizeLimitMb('spreadsheet')).toBe(FILE_TYPE_LIMITS.spreadsheet.default)
    expect(s.fileSizeLimitBytes('spreadsheet')).toBe(
      FILE_TYPE_LIMITS.spreadsheet.default * 1024 * 1024
    )
    expect(s.maxSnippetSizeKb).toBeGreaterThan(0)
  })

  it('records the one-time example-seed decision and persists it', () => {
    const s = useSettingsStore()
    expect(s.examplesSeeded).toBe(false) // fresh install: not yet decided
    s.markExamplesSeeded()
    expect(s.examplesSeeded).toBe(true)
    // survives a reload, so the example is never seeded twice
    setActivePinia(createPinia())
    expect(useSettingsStore().examplesSeeded).toBe(true)
  })

  it('ignores a stored shortcut-bar setting: the bar is gone', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ showShortcutBar: false }))
    expect('showShortcutBar' in useSettingsStore().$state).toBe(false)
  })

  it('clamps each file-type size guard to its own cap, independently', () => {
    const s = useSettingsStore()
    s.setFileSizeLimitMb('spreadsheet', 999999)
    expect(s.fileSizeLimitMb('spreadsheet')).toBe(FILE_TYPE_LIMITS.spreadsheet.cap)
    s.setFileSizeLimitMb('spreadsheet', 0)
    expect(s.fileSizeLimitMb('spreadsheet')).toBe(1)
    // The text limit is untouched by changes to the spreadsheet one.
    expect(s.fileSizeLimitMb('text')).toBe(FILE_TYPE_LIMITS.text.default)
    s.setFileSizeLimitMb('text', 999999)
    expect(s.fileSizeLimitMb('text')).toBe(FILE_TYPE_LIMITS.text.cap)
    s.setFileSizeLimitMb('bogus', 50) // unknown type ignored
    expect(s.fileSizeLimitsMb.bogus).toBeUndefined()
  })

  it('clamps the snippet size guard to its safe range', () => {
    const s = useSettingsStore()
    s.setLimit('maxSnippetSizeKb', 'not a number')
    expect(s.maxSnippetSizeKb).toBeGreaterThan(0)
    s.setLimit('maxSnippetSizeKb', 10_000_000)
    expect(s.maxSnippetSizeKb).toBe(MAX_SNIPPET_SIZE_KB_CAP)
  })

  it('clamps the diff-image height to its safe range, and survives a reload', () => {
    const s = useSettingsStore()
    expect(s.maxExportHeightPx).toBe(DEFAULT_MAX_EXPORT_HEIGHT_PX)
    s.setLimit('maxExportHeightPx', 'not a number')
    expect(s.maxExportHeightPx).toBe(DEFAULT_MAX_EXPORT_HEIGHT_PX)
    s.setLimit('maxExportHeightPx', 999_999)
    expect(s.maxExportHeightPx).toBe(MAX_EXPORT_HEIGHT_PX_CAP)
    s.setLimit('maxExportHeightPx', 1)
    expect(s.maxExportHeightPx).toBe(MIN_EXPORT_HEIGHT_PX)

    s.setLimit('maxExportHeightPx', 6500)
    setActivePinia(createPinia())
    expect(useSettingsStore().maxExportHeightPx).toBe(6500)
  })

  it('rejects a hand-edited diff-image height outside the range', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ maxExportHeightPx: 5_000_000 }))
    expect(useSettingsStore().maxExportHeightPx).toBe(MAX_EXPORT_HEIGHT_PX_CAP)
  })

  it('ignores the old single maxComparisonFileMb', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ maxComparisonFileMb: 42 }))
    expect(useSettingsStore().fileSizeLimitMb('text')).toBe(FILE_TYPE_LIMITS.text.default)
  })

  it('persists per-type limits, and nothing under the old single key', () => {
    useSettingsStore().setFileSizeLimitMb('spreadsheet', 60)
    const raw = JSON.parse(localStorage.getItem('diffbro.settings'))
    expect(raw.fileSizeLimitsMb.spreadsheet).toBe(60)
    expect(raw).not.toHaveProperty('maxComparisonFileMb')
    setActivePinia(createPinia())
    expect(useSettingsStore().fileSizeLimitMb('spreadsheet')).toBe(60)
  })

  it('daily theme rotation defaults off and persists when toggled', () => {
    const s = useSettingsStore()
    expect(s.rotateThemeDaily).toBe(false)
    s.setRotateThemeDaily(true)
    setActivePinia(createPinia())
    expect(useSettingsStore().rotateThemeDaily).toBe(true)
  })

  // The tag word beside a name on every sidebar row. On unless it has been
  // turned off — a missing key is a library that never asked, not a hidden one.
  it('shows row tags by default, and remembers being told not to', () => {
    const s = useSettingsStore()
    expect(s.showRowTags).toBe(true)
    s.setShowRowTags(false)
    setActivePinia(createPinia())
    expect(useSettingsStore().showRowTags).toBe(false)

    useSettingsStore().setShowRowTags(true)
    setActivePinia(createPinia())
    expect(useSettingsStore().showRowTags).toBe(true)
  })

  it('remembers a keyed dialog size across reloads', () => {
    const s = useSettingsStore()
    expect(s.dialogSize('snippet')).toBeNull() // default: use the dialog's own width
    s.setDialogSize('snippet', { width: 720, height: 560 })
    expect(s.dialogSize('snippet')).toEqual({ width: 720, height: 560 })
    setActivePinia(createPinia())
    expect(useSettingsStore().dialogSize('snippet')).toEqual({ width: 720, height: 560 })
  })

  // Reopening last session's comparisons is opt-OUT, so an absent (or junk)
  // stored value must read as on.
  it('persists the reopen-comparisons toggle, defaulting to on', () => {
    const s = useSettingsStore()
    expect(s.restoreSession).toBe(true)
    s.setRestoreSession(false)
    setActivePinia(createPinia())
    expect(useSettingsStore().restoreSession).toBe(false)

    localStorage.setItem('diffbro.settings', JSON.stringify({ restoreSession: 'sure' }))
    setActivePinia(createPinia())
    expect(useSettingsStore().restoreSession).toBe(true)
  })

  it('persists the maximize-dialogs toggle', () => {
    const s = useSettingsStore()
    expect(s.maximizeDialogs).toBe(false)
    s.setMaximizeDialogs(true)
    expect(s.maximizeDialogs).toBe(true)
    setActivePinia(createPinia())
    expect(useSettingsStore().maximizeDialogs).toBe(true)
  })

  it('keeps each dialog key independent', () => {
    const s = useSettingsStore()
    s.setDialogSize('snippet', { width: 720, height: 560 })
    s.setDialogSize('base64', { width: 640, height: 480 })
    expect(s.dialogSize('snippet')).toEqual({ width: 720, height: 560 })
    expect(s.dialogSize('base64')).toEqual({ width: 640, height: 480 })
    expect(s.dialogSize('unknown')).toBeNull()
  })

  it('clamps a stored size to its bounds and rejects partial ones', () => {
    const s = useSettingsStore()
    s.setDialogSize('snippet', { width: 10, height: 99999 }) // below min / above max
    expect(s.dialogSize('snippet')).toEqual({ width: 320, height: 3000 })
    s.setDialogSize('snippet', { width: 800 }) // missing height — ignored
    expect(s.dialogSize('snippet')).toEqual({ width: 320, height: 3000 })
  })

  it('drops a corrupt persisted dialog size but keeps valid siblings', () => {
    localStorage.setItem(
      'diffbro.settings',
      JSON.stringify({
        dialogSizes: {
          snippet: { width: 'wide', height: 400 },
          base64: { width: 600, height: 500 }
        }
      })
    )
    const s = useSettingsStore()
    expect(s.dialogSize('snippet')).toBeNull()
    expect(s.dialogSize('base64')).toEqual({ width: 600, height: 500 })
  })

  it('accepts and persists a valid quick look-up shortcut', () => {
    const s = useSettingsStore()
    expect(s.quickLookShortcut).toBe('CommandOrControl+Shift+Space')
    expect(s.setQuickLookShortcut('Alt+Shift+D')).toBe(true)
    expect(s.quickLookShortcut).toBe('Alt+Shift+D')
    expect(JSON.parse(localStorage.getItem('diffbro.settings')).quickLookShortcut).toBe(
      'Alt+Shift+D'
    )
  })

  it('rejects an invalid shortcut and keeps the previous binding', () => {
    const s = useSettingsStore()
    expect(s.setQuickLookShortcut('Space')).toBe(false) // no modifier
    expect(s.quickLookShortcut).toBe('CommandOrControl+Shift+Space')
  })

  it('falls back to the default when the persisted shortcut is invalid', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ quickLookShortcut: 'garbage' }))
    const s = useSettingsStore()
    expect(s.quickLookShortcut).toBe('CommandOrControl+Shift+Space')
  })

  it('records recent tools most-recent-first, deduped and capped', () => {
    const s = useSettingsStore()
    expect(s.recentTools).toEqual([])
    s.noteToolUsed('json')
    s.noteToolUsed('base64')
    s.noteToolUsed('json') // promotes, never duplicates
    expect(s.recentTools).toEqual(['json', 'base64'])

    // Overflow the cap, whatever it is, and check the newest survived it.
    for (const t of TOOLS) s.noteToolUsed(t.id)
    expect(s.recentTools).toHaveLength(MAX_RECENT_TOOLS)
    expect(s.recentTools[0]).toBe(TOOLS.at(-1).id)
    expect(JSON.parse(localStorage.getItem('diffbro.settings')).recentTools).toEqual(s.recentTools)
  })

  // The rail draws every remembered tool, so a stale cap in readState would
  // silently starve it however high the surface's own limit went.
  it('reads back every remembered tool, not just the shelf-sized slice', () => {
    const s = useSettingsStore()
    for (const id of ['json', 'base64', 'xml', 'lines', 'uuid']) s.noteToolUsed(id)
    expect(s.recentTools).toHaveLength(5)

    setActivePinia(createPinia())
    const reloaded = useSettingsStore()
    expect(reloaded.recentTools).toEqual(['uuid', 'lines', 'xml', 'base64', 'json'])
    expect(recentTools(reloaded.recentTools)).toHaveLength(5)
    expect(MAX_RECENT_TOOLS).toBeGreaterThanOrEqual(5)
  })

  it('ignores an unknown tool id without persisting a change', () => {
    const s = useSettingsStore()
    s.noteToolUsed('json')
    const before = localStorage.getItem('diffbro.settings')
    s.noteToolUsed('not-a-tool')
    expect(s.recentTools).toEqual(['json'])
    expect(localStorage.getItem('diffbro.settings')).toBe(before)
  })

  it('drops junk from a hand-edited recentTools list', () => {
    localStorage.setItem(
      'diffbro.settings',
      JSON.stringify({ recentTools: ['json', 42, 'gone', 'uuid'] })
    )
    const s = useSettingsStore()
    expect(s.recentTools).toEqual(['json', 'gone', 'uuid'])
    // A stale id survives storage but is dropped at render time (utils/tools).
    expect(recentTools(s.recentTools).map((t) => t.id)).toEqual(['json', 'uuid'])
  })
})

// The sidebar is 256px of an eighth of the window, permanently. Collapsing it
// is a preference, so it has to survive a relaunch like the others.
describe('the collapsed sidebar', () => {
  it('starts expanded', () => {
    expect(useSettingsStore().sidebarCollapsed).toBe(false)
  })

  it('remembers being collapsed across a reload', () => {
    useSettingsStore().setSidebarCollapsed(true)
    setActivePinia(createPinia())
    expect(useSettingsStore().sidebarCollapsed).toBe(true)
  })

  it('comes back expanded once it is opened again', () => {
    const s = useSettingsStore()
    s.setSidebarCollapsed(true)
    s.setSidebarCollapsed(false)
    setActivePinia(createPinia())
    expect(useSettingsStore().sidebarCollapsed).toBe(false)
  })

  it('ignores a hand-edited non-boolean', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ sidebarCollapsed: 'yes' }))
    setActivePinia(createPinia())
    expect(useSettingsStore().sidebarCollapsed).toBe(false)
  })
})

describe('System theme', () => {
  let osDark
  let listeners
  const stubOs = (dark) => {
    osDark = dark
    listeners = []
    window.matchMedia = () => ({
      get matches() {
        return osDark
      },
      addEventListener: (_, cb) => listeners.push(cb)
    })
  }
  const flipOs = (dark) => {
    osDark = dark
    listeners.forEach((cb) => cb())
  }
  afterEach(() => {
    delete window.matchMedia
  })

  it('is the default, and shows the ground the OS asks for', () => {
    stubOs(true)
    const s = useSettingsStore()
    expect(s.userTheme).toBe('system')
    expect(s.theme).toBe('dark')
    s.initTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('follows the OS live, without saving anything', () => {
    stubOs(false)
    const s = useSettingsStore()
    s.initTheme()
    flipOs(true)
    expect(s.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(s.userTheme).toBe('system')
    expect(localStorage.getItem('diffbro.theme')).toBeNull()
  })

  it('leaves a named theme alone when the OS changes', () => {
    stubOs(false)
    const s = useSettingsStore()
    s.initTheme()
    s.setTheme('nord')
    flipOs(true)
    expect(s.theme).toBe('nord')
  })

  it('keeps a saved Light on a dark OS', () => {
    localStorage.setItem('diffbro.theme', 'light')
    stubOs(true)
    const s = useSettingsStore()
    expect(s.userTheme).toBe('light')
    expect(s.theme).toBe('light')
  })

  it('toggleTheme flips what is showing, and saves it in place of System', () => {
    stubOs(true)
    const s = useSettingsStore()
    s.initTheme()
    s.toggleTheme()
    expect(s.theme).toBe('light')
    expect(s.userTheme).toBe('light')
    expect(localStorage.getItem('diffbro.theme')).toBe('light')
  })

  it('names the picked tile: System while it is picked, the day theme while rotating', () => {
    stubOs(true)
    const s = useSettingsStore()
    s.initTheme()
    expect(s.pickedTheme).toBe('system')
    s.setRotateThemeDaily(true)
    s.resolveActiveTheme()
    expect(s.pickedTheme).toBe(s.theme)
  })
})

describe('theme', () => {
  it('defaults to Light and toggleTheme flips the ground, persisting + stamping', () => {
    const s = useSettingsStore()
    expect(s.theme).toBe('light') // Light is the default
    s.toggleTheme()
    expect(s.theme).toBe('dark')
    expect(localStorage.getItem('diffbro.theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    s.toggleTheme()
    expect(s.theme).toBe('light')
  })
  it('setTheme applies any named theme and normalizes an unknown one to Light', () => {
    const s = useSettingsStore()
    s.setTheme('neon')
    expect(s.theme).toBe('neon')
    expect(document.documentElement.dataset.theme).toBe('neon')
    expect(localStorage.getItem('diffbro.theme')).toBe('neon')
    // Ctrl+D from a dark-ground theme flips to Light.
    s.toggleTheme()
    expect(s.theme).toBe('light')
    s.setTheme('bogus')
    expect(s.theme).toBe('light')
  })
  it('daily rotation overrides the active theme but keeps the saved choice, reverting when off', async () => {
    const s = useSettingsStore()
    s.setTheme('neon') // the user's saved pick

    s.setRotateThemeDaily(true)
    s.resolveActiveTheme()
    const { themeForDay } = await import('../../../src/renderer/src/utils/themes')
    expect(s.theme).toBe(themeForDay()) // active is the day's theme
    expect(s.userTheme).toBe('neon') // saved choice untouched

    // Picking a theme while rotating saves it but doesn't override today's theme.
    s.setTheme('solar')
    expect(s.userTheme).toBe('solar')
    expect(s.theme).toBe(themeForDay())

    // Turning rotation off reverts to the saved choice.
    s.setRotateThemeDaily(false)
    s.resolveActiveTheme()
    expect(s.theme).toBe('solar')
  })
})

describe('locale', () => {
  // en-XA is a real second value, so these discriminate. Asserting 'en' against
  // a default of 'en' passes even if setLocale does nothing at all.
  it('is unset until the user picks one, so the OS choice still applies', () => {
    expect(useSettingsStore().locale).toBe(null)
  })

  it('stores the chosen locale and persists it', () => {
    const s = useSettingsStore()
    s.setLocale('en-XA')
    expect(s.locale).toBe('en-XA')
    expect(JSON.parse(localStorage.getItem('diffbro.settings')).locale).toBe('en-XA')
  })

  // The value reaches a message lookup and is handed to main, so an unknown one
  // must never survive the setter.
  it('normalizes a locale it does not ship', () => {
    const s = useSettingsStore()
    s.setLocale('en-XA')
    s.setLocale('kl')
    expect(s.locale).toBe('en')
    s.setLocale('en-XA')
    s.setLocale(null)
    expect(s.locale).toBe('en')
  })

  it('reads a persisted locale back on init', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ locale: 'en-XA' }))
    setActivePinia(createPinia())
    expect(useSettingsStore().locale).toBe('en-XA')
  })

  it('ignores a persisted locale this build does not ship', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ locale: '../../etc' }))
    setActivePinia(createPinia())
    expect(useSettingsStore().locale).toBe(null)
  })
})

describe('sidebar panel', () => {
  it('opens on Home', () => {
    expect(useSettingsStore().sidebarPanel).toBe('home')
  })

  it('remembers the panel across a reload', () => {
    useSettingsStore().setSidebarPanel('tools')
    setActivePinia(createPinia())
    expect(useSettingsStore().sidebarPanel).toBe('tools')
  })

  it('refuses a panel that does not exist', () => {
    const s = useSettingsStore()
    s.setSidebarPanel('snippets')
    s.setSidebarPanel('external')
    expect(s.sidebarPanel).toBe('snippets')
  })

  it('falls back to Home on a hand-edited value', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ sidebarPanel: 'saved' }))
    setActivePinia(createPinia())
    expect(useSettingsStore().sidebarPanel).toBe('home')
  })
})
