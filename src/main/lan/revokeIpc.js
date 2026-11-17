import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { signRevoke, verifyRevoke } from './revoke'
import { keepPending, takePending } from './pendingNotices'
import { connectTo } from './server'
import { forgetItemsFrom } from './itemsIpc'
import { readTrusted, removeTrusted } from '../trustedKeys'

const FP = /^[0-9a-f]{32}$/
const pendingFile = () => join(app.getPath('userData'), 'lan-notices.json')
const send = (channel, payload) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

let ctx = null

function deliver(fp, frame) {
  const endpoint = ctx.lan.endpointOf(fp)
  if (!endpoint) return Promise.resolve(false)
  return connectTo(endpoint, { onFrame: () => {}, onClose: () => {} })
    .then((conn) => {
      conn.send(frame)
      conn.close()
      return true
    })
    .catch(() => false)
}

async function stopSharing(fp) {
  const person = (await readTrusted()).find((t) => t.fingerprint === fp)
  if (!person) return { error: 'unknown-recipient' }
  const { priv, pub } = ctx.identity
  const frame = signRevoke({ priv, fp: pub.fingerprint, to: fp, at: Date.now() })
  await removeTrusted(fp)
  forgetItemsFrom(fp)
  if (!(await deliver(fp, frame))) keepPending(pendingFile(), fp, frame, Date.now())
  ctx.onTrustChanged()
  send('lan:itemsChanged', null)
  return { ok: true, name: person.label }
}

async function onRevoke({ header }, conn) {
  conn.close()
  const told = verifyRevoke(header, {
    trusted: await readTrusted(),
    me: ctx.identity.pub.fingerprint,
    now: Date.now()
  })
  if (told) send('lan:revoked', told)
}

async function onPeerSeen(fp) {
  const frame = takePending(pendingFile(), fp, Date.now())
  if (frame && !(await deliver(fp, frame))) keepPending(pendingFile(), fp, frame, Date.now())
}

export function setUpRevoke({ lan, identity, onTrustChanged }) {
  ctx = { lan, identity, onTrustChanged }
  lan.on('revoke', onRevoke)
  lan.onPeerSeen((fp) => onPeerSeen(fp).catch(() => {}))
}

export function registerRevokeIpc() {
  ipcMain.handle('lan:stopSharing', (_e, fp) =>
    ctx && typeof fp === 'string' && FP.test(fp) ? stopSharing(fp) : { error: 'unknown-recipient' }
  )
}
