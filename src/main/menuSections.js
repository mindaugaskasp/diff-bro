// Menu sections lifted out of installMenu, which is at its size cap. `send` is
// passed in rather than imported so this file stays free of window/focus logic
// — menu.js owns which window an action reaches.
//
// Labels resolve through t() at BUILD time, so each of these runs again when the
// language changes — menu.js reinstalls the whole template rather than patching
// labels in place.
import { t } from './i18n'

/** A menu row: its catalogue key under `menu.`, an optional accelerator, the action sent. */
const item = (send, key, accelerator, action) => ({
  label: t(`menu.${key}`),
  ...(accelerator ? { accelerator } : {}),
  click: () => send(action)
})
const group = (key, submenu) => ({ label: t(`menu.${key}`), submenu })

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
    item(send, 'edit.swapSides', 'CmdOrCtrl+Shift+S', 'swap'),
    group('edit.copy', [
      item(send, 'edit.copyPatch', 'CmdOrCtrl+Shift+C', 'copy-diff'),
      item(send, 'edit.copyFile', 'CmdOrCtrl+Shift+F', 'copy-diff-file'),
      // Shift over the digit that OPENS that side (CmdOrCtrl+1 / +2).
      item(send, 'edit.copyLeft', 'CmdOrCtrl+Shift+1', 'copy-left'),
      item(send, 'edit.copyRight', 'CmdOrCtrl+Shift+2', 'copy-right')
    ]),
    item(send, 'edit.applyPatch', null, 'apply-patch'),
    { type: 'separator' },
    item(send, 'edit.pasteMode', 'CmdOrCtrl+T', 'toggle-paste')
  ]
})

/** @param {(action: string) => void} send */
export const securityMenu = (send) => ({
  label: t('menu.security.title'),
  submenu: [
    group('security.myKey', [
      item(send, 'security.sharePublicKey', null, 'export-pubkey'),
      item(send, 'security.replaceKey', null, 'rotate-key')
    ]),
    group('security.trustedKeys', [
      item(send, 'security.addTrustedKey', null, 'add-trusted-key'),
      item(send, 'security.manageTrustedKeys', null, 'manage-keys')
    ]),
    { type: 'separator' },
    group('security.configuration', [
      item(send, 'security.backUp', null, 'config-backup'),
      item(send, 'security.restore', null, 'config-restore')
    ])
  ]
})

// The Tools panel's job groups (utils/toolGroups.js), so the menu and the panel agree.
/** @param {(action: string) => void} send */
export const toolsMenu = (send) => ({
  label: t('menu.tools.title'),
  submenu: [
    group('tools.encode', [
      item(send, 'tools.base64', 'CmdOrCtrl+Shift+B', 'tools-base64'),
      item(send, 'tools.url', null, 'tools-url')
    ]),
    group('tools.format', [
      item(send, 'tools.json', 'CmdOrCtrl+Shift+J', 'tools-json'),
      item(send, 'tools.xml', 'CmdOrCtrl+Shift+M', 'tools-xml'),
      item(send, 'tools.lines', 'CmdOrCtrl+Shift+R', 'tools-lines')
    ]),
    group('tools.generate', [
      item(send, 'tools.uuid', 'CmdOrCtrl+Shift+U', 'tools-uuid'),
      item(send, 'tools.epoch', null, 'tools-epoch'),
      item(send, 'tools.checksum', null, 'tools-hash')
    ]),
    group('tools.inspect', [
      item(send, 'tools.jwt', null, 'tools-jwt'),
      item(send, 'tools.regex', null, 'tools-regex')
    ]),
    group('tools.secure', [item(send, 'tools.encryptDecrypt', 'CmdOrCtrl+Shift+X', 'tools-crypt')])
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
    // Lands on the Settings pane that lists the `diffbro` subcommands.
    { label: t('menu.help.terminal'), click: () => send('settings-cli') },
    { type: 'separator' },
    { label: t('menu.help.reportIssue'), click: onReportIssue }
  ]
})
