// Menu sections lifted out of installMenu, which is at its size cap. `send` is
// passed in rather than imported so this file stays free of window/focus logic
// — menu.js owns which window an action reaches.
//
// Labels resolve through t() at BUILD time, so each of these runs again when the
// language changes — menu.js reinstalls the whole template rather than patching
// labels in place.
import { t } from './i18n'

/** @param {(action: string) => void} send */
export const editMenu = (send, isMac) => ({
  label: t('menu.edit.title'),
  submenu: [
    // macOS routes clipboard shortcuts through the app menu, so these roles
    // are required for text inputs to work; Chromium handles it elsewhere.
    ...(isMac
      ? [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
          { type: 'separator' }
        ]
      : []),
    {
      label: t('menu.edit.swapSides'),
      accelerator: 'CmdOrCtrl+Shift+S',
      click: () => send('swap')
    },
    { label: t('menu.edit.clear'), accelerator: 'CmdOrCtrl+K', click: () => send('clear') },
    {
      label: t('menu.edit.copyPatch'),
      accelerator: 'CmdOrCtrl+Shift+C',
      click: () => send('copy-diff')
    },
    {
      label: t('menu.edit.copyFile'),
      accelerator: 'CmdOrCtrl+Shift+F',
      click: () => send('copy-diff-file')
    },
    { label: t('menu.edit.applyPatch'), click: () => send('apply-patch') },
    { type: 'separator' },
    {
      label: t('menu.edit.pasteTextMode'),
      accelerator: 'CmdOrCtrl+T',
      click: () => send('toggle-paste')
    }
  ]
})

/** @param {(action: string) => void} send */
export const securityMenu = (send) => ({
  label: t('menu.security.title'),
  submenu: [
    { label: t('menu.security.sharePublicKey'), click: () => send('export-pubkey') },
    { type: 'separator' },
    { label: t('menu.security.addTrustedKey'), click: () => send('add-trusted-key') },
    { label: t('menu.security.manageTrustedKeys'), click: () => send('manage-keys') },
    { label: t('menu.security.replaceKey'), click: () => send('rotate-key') },
    { type: 'separator' },
    {
      label: t('menu.security.configuration'),
      submenu: [
        { label: t('menu.security.backUp'), click: () => send('config-backup') },
        { label: t('menu.security.restore'), click: () => send('config-restore') }
      ]
    }
  ]
})

/** @param {(action: string) => void} send */
export const toolsMenu = (send) => ({
  label: t('menu.tools.title'),
  submenu: [
    {
      label: t('menu.tools.base64'),
      accelerator: 'CmdOrCtrl+Shift+B',
      click: () => send('tools-base64')
    },
    {
      label: t('menu.tools.json'),
      accelerator: 'CmdOrCtrl+Shift+J',
      click: () => send('tools-json')
    },
    {
      label: t('menu.tools.xml'),
      accelerator: 'CmdOrCtrl+Shift+M',
      click: () => send('tools-xml')
    },
    {
      label: t('menu.tools.uuid'),
      accelerator: 'CmdOrCtrl+Shift+U',
      click: () => send('tools-uuid')
    },
    { label: t('menu.tools.jwt'), click: () => send('tools-jwt') },
    { label: t('menu.tools.epoch'), click: () => send('tools-epoch') },
    { label: t('menu.tools.url'), click: () => send('tools-url') },
    {
      label: t('menu.tools.lines'),
      accelerator: 'CmdOrCtrl+Shift+R',
      click: () => send('tools-lines')
    },
    { label: t('menu.tools.checksum'), click: () => send('tools-hash') },
    { label: t('menu.tools.regex'), click: () => send('tools-regex') },
    {
      label: t('menu.tools.textEncryption'),
      submenu: [
        {
          label: t('menu.tools.encryptDecrypt'),
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => send('tools-crypt')
        }
      ]
    }
  ]
})

/**
 * @param {object} opts
 * @param {(action: string) => void} opts.send
 * @param {string} opts.version
 * @param {Function} opts.onReportIssue
 */
export const helpMenu = ({ send, version, onReportIssue }) => ({
  role: 'help',
  label: t('menu.help.title'),
  submenu: [
    // Anchor for a future "Check for Updates…" opening this tag's release.
    { label: `Diff Bro v${version}`, enabled: false },
    { type: 'separator' },
    { label: t('menu.help.shortcuts'), click: () => send('shortcuts') },
    { label: t('menu.help.showTour'), click: () => send('show-tour') },
    { type: 'separator' },
    { label: t('menu.help.reportIssue'), click: onReportIssue }
  ]
})
