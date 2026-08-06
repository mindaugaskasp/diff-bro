import { MOD } from './keys'
import { securityItems } from './menuSecurity'
import { toolsItems } from './menuTools'
import { t } from './i18n'

// The in-app menu bar's contents (Windows/Linux). Kept out of MenuBar.vue so
// the component stays presentation: this is the list, that file is the
// dropdown behaviour.
//
// Every accelerator here must have a twin in the hidden application menu
// (src/main/menu.js) — that is what actually binds the shortcut.
//
// Declarative: an item names an action, it never calls a store. `run` comes
// from useCommands, and commands.test.js fails if a name here resolves to
// nothing.
// The four display options, in the order the View menu and ViewOptionsMenu both
// show them. Whitespace and Focus carry no accelerator: the free keys near
// MOD+\\ are worth more elsewhere.
const displayToggles = (run) => [
  {
    label: t('menu.view.toggleStructure'),
    keys: `${MOD}+Shift+D`,
    run: () => run('toggle-structure')
  },
  { label: t('menu.view.toggleSplit'), keys: `${MOD}+\\`, run: () => run('toggle-split') },
  { label: t('menu.view.toggleWhitespace'), run: () => run('toggle-whitespace') },
  { label: t('menu.view.toggleFocus'), run: () => run('toggle-focus') }
]

export function buildMenus(run) {
  return [
    {
      id: 'file',
      label: t('menu.file.title'),
      items: [
        { label: t('menu.file.openLeft'), keys: `${MOD}+1`, run: () => run('open-left') },
        { label: t('menu.file.openRight'), keys: `${MOD}+2`, run: () => run('open-right') },
        { sep: true },
        { label: t('menu.file.save'), keys: `${MOD}+S`, run: () => run('save') },
        { label: t('menu.file.share'), keys: `${MOD}+E`, run: () => run('share-current') },
        { label: t('menu.file.import'), keys: `${MOD}+I`, run: () => run('import-shared') },
        { label: t('menu.file.exportHtml'), run: () => run('export-html') },
        { label: t('menu.file.exportImage'), run: () => run('export-image') },
        { sep: true },
        {
          label: t('menu.file.newComparison'),
          keys: `${MOD}+Shift+T`,
          run: () => run('tab-new')
        },
        {
          label: t('menu.file.closeComparison'),
          keys: `${MOD}+Shift+W`,
          run: () => run('tab-close')
        },
        {
          label: t('menu.file.nextComparison'),
          keys: 'Ctrl+Tab',
          run: () => run('tab-next')
        },
        {
          label: t('menu.file.prevComparison'),
          keys: 'Ctrl+Shift+Tab',
          run: () => run('tab-prev')
        },
        { label: t('menu.file.importSnippets'), run: () => run('import-snippets') },
        { sep: true },
        { label: t('menu.file.settings'), keys: `${MOD}+,`, run: () => run('settings') },
        { sep: true },
        { label: t('menu.file.quit'), paletteHidden: true, run: () => window.api.quit() }
      ]
    },
    {
      id: 'edit',
      label: t('menu.edit.title'),
      items: [
        { label: t('menu.edit.swapSides'), keys: `${MOD}+Shift+S`, run: () => run('swap') },
        { label: t('menu.edit.clear'), keys: `${MOD}+K`, run: () => run('clear') },
        {
          label: t('menu.edit.copyPatch'),
          keys: `${MOD}+Shift+C`,
          run: () => run('copy-diff')
        },
        {
          label: t('menu.edit.copyFile'),
          keys: `${MOD}+Shift+F`,
          run: () => run('copy-diff-file')
        },
        { label: t('menu.edit.applyPatch'), run: () => run('apply-patch') },
        { sep: true },
        { label: t('menu.edit.pasteTextMode'), keys: `${MOD}+T`, run: () => run('toggle-paste') }
      ]
    },
    {
      id: 'view',
      label: t('menu.view.title'),
      items: [
        {
          label: t('menu.view.commandPalette'),
          keys: `${MOD}+Shift+P`,
          paletteHidden: true,
          run: () => run('command-palette')
        },
        { sep: true },
        ...displayToggles(run),
        {
          label: t('menu.view.toggleSidebar'),
          keys: `${MOD}+B`,
          run: () => run('toggle-sidebar')
        },
        { label: t('menu.view.toggleTheme'), keys: `${MOD}+D`, run: () => run('toggle-theme') },
        { sep: true },
        {
          // No key hint: the binding is user-configurable (Settings →
          // Shortcuts), so a fixed label here would go stale once rebound.
          label: t('menu.view.quickLook'),
          run: () => window.api.quickLookToggle()
        },
        { sep: true },
        {
          label: t('menu.view.zoomIn'),
          keys: `${MOD}++`,
          paletteHidden: true,
          run: () => run('zoom-in')
        },
        {
          label: t('menu.view.zoomOut'),
          keys: `${MOD}+-`,
          paletteHidden: true,
          run: () => run('zoom-out')
        },
        {
          label: t('menu.view.resetZoom'),
          keys: `${MOD}+0`,
          paletteHidden: true,
          run: () => run('zoom-reset')
        },
        { sep: true, devOnly: true },
        {
          label: t('menu.view.devTools'),
          devOnly: true,
          paletteHidden: true,
          run: () => window.api.toggleDevTools()
        }
      ]
    },
    {
      id: 'security',
      label: t('menu.security.title'),
      items: securityItems(run)
    },
    {
      id: 'tools',
      label: t('menu.tools.title'),
      // Grouped by format (Tools → Base64 → …) to mirror the native menu.
      items: toolsItems(run)
    },
    {
      id: 'help',
      label: t('menu.help.title'),
      items: [
        // Mirrors the native menu; anchor for a future "Check for Updates…".
        { label: `Diff Bro v${window.api.appVersion}`, info: true },
        { sep: true },
        { label: t('menu.help.shortcuts'), run: () => run('shortcuts') },
        { label: t('menu.help.showTour'), run: () => run('show-tour') },
        { sep: true },
        { label: t('menu.help.reportIssue'), run: () => window.api.reportIssue() }
      ]
    }
  ]
}
