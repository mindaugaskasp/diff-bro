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
import { buildMailto, fillTemplate, keyMessage } from './mailto'
import { addressesFor } from './trustedKeys'
import { sealAndWrite } from './shareExport'
import { copyPathToClipboard } from './clipboardCopy'
import { stageFile } from './clipboardStage'
import { encodePublicKey } from './sealing'
import { getIdentity, keyFileBasename, pubWithLabel } from './share'
import { guardIdentity } from './shareCore'
import { t } from './i18n'

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

// Built here from validated parts, and checked again on the way out: the value
// handed to the OS is the one the policy passed, never a near-miss.
const mailtoError = (built) => {
  if (built.error === 'too-long') return 'note-too-long'
  return built.ok && isSafeMailtoUrl(built.url) ? null : 'bad-address'
}

async function confirmHandoff(sender, { to, path }) {
  const parent = BrowserWindow.fromWebContents(sender) ?? undefined
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question',
    buttons: [t('dialog.mail.openMailApp'), t('common.cancel')],
    defaultId: 0,
    cancelId: 1,
    message: t('dialog.mail.message'),
    detail: t('dialog.mail.detail', {
      to: to.map((r) => r.email).join(', '),
      file: basename(path)
    })
  })
  return response === 0
}

/**
 * Seal, then hand off. Returns what actually happened so the renderer can say
 * "on the clipboard" or "in Finder" rather than guessing.
 */
async function handoff(sender, { entry, recipientFps, subjectTemplate, note, reveal }) {
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
  // `path` rides along on every failure past this point: the file EXISTS, and a
  // caller that cannot tell "nothing happened" from "a sealed file is sitting on
  // your disk" will orphan it.
  const built = buildMailto({ to: resolved.to.map((r) => r.email), subject, body: note })
  const urlError = mailtoError(built)
  if (urlError) return { error: urlError, path: sealed.path }

  if (!(await confirmHandoff(sender, { to: resolved.to, path: sealed.path }))) {
    return { canceled: true, path: sealed.path }
  }

  return deliver(sealed.path, { url: built.url, reveal, to: resolved.to })
}

// The OS half, split out so `handoff` stays inside the complexity cap.
async function deliver(path, { url, reveal, to }) {
  // Puts the sealed file on the clipboard as the fallback. A failure here only
  // costs that fallback, never the hand-off itself.
  const copied = await copyPathToClipboard(path)
  // A machine with no registered mailto: handler rejects here. The file is
  // already written, so this reports rather than throws — an unhandled
  // rejection would tell the user nothing and orphan the file.
  try {
    await os.openExternal(url)
  } catch {
    if (reveal !== false) os.showItemInFolder(path)
    return { error: 'no-mail-app', path, name: basename(path), copied: copied.ok === true }
  }
  // The fallback, and the user can turn it off (Settings → Email) once the
  // clipboard route is doing the job on their desktop.
  if (reveal !== false) os.showItemInFolder(path)
  return {
    ok: true,
    path,
    name: basename(path),
    copied: copied.ok === true,
    to: to.map((r) => r.label).join(', ')
  }
}

// The key hand-off: the same walk, but the draft is UNADDRESSED — the key goes
// to someone not yet in the trust store, so the user addresses it themselves —
// and the staged file is the public key, ready to paste into the message.
async function keyHandoff(sender, { label, reveal }) {
  const pub = await pubWithLabel(typeof label === 'string' ? label : null)
  const staged = await stageFile({
    name: keyFileBasename(pub.label ?? '', pub.fingerprint),
    bytes: encodePublicKey(pub)
  })
  if (!staged.ok) return staged
  const msg = keyMessage({ label: pub.label, fingerprint: pub.fingerprint })
  const built = buildMailto({ to: [], subject: msg.subject, body: msg.body, allowEmptyTo: true })
  if (!built.ok || !isSafeMailtoUrl(built.url, { allowEmptyAddressee: true })) {
    return { error: 'bad-address', path: staged.path }
  }
  if (!(await confirmKeyHandoff(sender, staged.path))) {
    return { canceled: true, path: staged.path }
  }
  return deliver(staged.path, { url: built.url, reveal, to: [] })
}

async function confirmKeyHandoff(sender, path) {
  const parent = BrowserWindow.fromWebContents(sender) ?? undefined
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question',
    buttons: [t('dialog.mail.openMailApp'), t('common.cancel')],
    defaultId: 0,
    cancelId: 1,
    message: t('dialog.keyMail.message'),
    detail: t('dialog.keyMail.detail', { file: basename(path) })
  })
  return response === 0
}

export function registerMailIpc() {
  // Both handlers take no path: fingerprints and text in, a description of
  // what happened out.
  ipcMain.handle(
    'mail:handoff',
    guardIdentity(async (e, args) => handoff(e.sender, args ?? {}))
  )
  ipcMain.handle(
    'mail:keyHandoff',
    guardIdentity(async (e, args) => keyHandoff(e.sender, args ?? {}))
  )
}
