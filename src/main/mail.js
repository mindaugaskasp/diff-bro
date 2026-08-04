// The mail hand-off. Diff Bro never sends anything: it seals the diff, opens the
// user's own mail client on an addressed message, puts the sealed file on the
// clipboard, and reveals it as the fallback. No socket is opened here — hard
// security rule 1 is untouched, and `grep -n "tls\|net\.\|http" src/main/mail.js`
// is expected to find nothing.
//
// One call does the whole sequence so the sealed PATH never round-trips through
// the renderer, which would hand it an arbitrary-path parameter into
// shell.showItemInFolder. The renderer supplies fingerprints and text.
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { basename } from 'path'
import { isSafeMailtoUrl } from './linkPolicy'
import { buildMailto, fillTemplate } from './mailto'
import { addressesFor } from './trustedKeys'
import { sealAndWrite } from './shareExport'
import { copyPathToClipboard } from './clipboardCopy'
import { getIdentity } from './share'
import { guardIdentity } from './shareCore'

// Test seam: e2e stubs these so a spec never opens a real mail draft or a Finder
// window on the machine running it. Never reachable from a packaged build.
const os = {
  openExternal: (url) => shell.openExternal(url),
  showItemInFolder: (path) => shell.showItemInFolder(path)
}
export function setOsHooksForTests(hooks) {
  Object.assign(os, hooks)
}

const DEFAULT_SUBJECT = 'Sealed diff: {name}'

async function confirmHandoff(sender, { to, path }) {
  const parent = BrowserWindow.fromWebContents(sender) ?? undefined
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question',
    buttons: ['Open my mail app', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: 'Open a new message in your mail app?',
    detail:
      `To: ${to.map((r) => r.email).join(', ')}\n\n` +
      `${basename(path)} is already saved. Diff Bro will copy it to the clipboard so you ` +
      `can paste it into the message — it does not send anything itself.`
  })
  return response === 0
}

/**
 * Seal, then hand off. Returns what actually happened so the renderer can say
 * "on the clipboard" or "in Finder" rather than guessing.
 */
async function handoff(sender, { entry, recipientFps, subjectTemplate, note }) {
  const resolved = await addressesFor(recipientFps)
  if (!resolved.ok) return resolved

  const identity = await getIdentity()
  const sealed = await sealAndWrite({ entry, recipientFps, identity })
  if (!sealed.ok) return sealed

  const subject = fillTemplate({
    template: subjectTemplate || DEFAULT_SUBJECT,
    name: entry?.name,
    expires: entry?.expiresAt ? new Date(entry.expiresAt).toLocaleString() : ''
  })
  const built = buildMailto({ to: resolved.to.map((r) => r.email), subject, body: note })
  // Built here from validated parts, and checked again on the way out: the value
  // handed to the OS is the one the policy passed, never a near-miss.
  if (!built.ok || !isSafeMailtoUrl(built.url)) return { error: 'bad-address', path: sealed.path }

  if (!(await confirmHandoff(sender, { to: resolved.to, path: sealed.path }))) {
    return { canceled: true, path: sealed.path }
  }

  const copied = copyPathToClipboard(sealed.path)
  await os.openExternal(built.url)
  os.showItemInFolder(sealed.path)

  return {
    ok: true,
    path: sealed.path,
    name: basename(sealed.path),
    copied: copied.ok === true,
    to: resolved.to.map((r) => r.label).join(', ')
  }
}

export function registerMailIpc() {
  // The only handler here, and it takes no path: fingerprints and text in, a
  // description of what happened out.
  ipcMain.handle(
    'mail:handoff',
    guardIdentity(async (e, args) => handoff(e.sender, args ?? {}))
  )
}
