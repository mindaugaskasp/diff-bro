import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { signRevoke, verifyRevoke } from './revoke'
import { digestOf, signAck, verifyAck } from './acks'
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

const ACK_MS = 10_000
const ackFields = (frame) => ({
  kind: 'revoke',
  digest: digestOf(Buffer.from(frame.sig)),
  ok: true
})

// Delivered only when the recipient signs for it; anyone can answer on an address.
function deliver(fp, { signKey, ...frame }) {
  const endpoint = ctx.lan.endpointOf(fp)
  if (!endpoint) return Promise.resolve(false)
  return new Promise((resolve) => {
    let conn = null
    const timer = setTimeout(() => {
      conn?.destroy()
      resolve(false)
    }, ACK_MS)
    const finish = (ok) => {
      clearTimeout(timer)
      resolve(ok)
    }
    connectTo(endpoint, {
      onFrame: ({ header }, c) => {
        c.close()
        finish(header.type === 'revoke-ack' && verifyAck(signKey, ackFields(frame), header.sig))
      },
      onClose: () => finish(false)
    })
      .then((c) => {
        conn = c
        c.send(frame)
      })
      .catch(() => finish(false))
  })
}

async function stopSharing(fp) {
  const person = (await readTrusted()).find((t) => t.fingerprint === fp)
  if (!person) return { error: 'unknown-recipient' }
  const { priv, pub } = ctx.identity
  const notice = {
    ...signRevoke({ priv, fp: pub.fingerprint, to: fp, at: Date.now() }),
    signKey: person.sign
  }
  await removeTrusted(fp)
  forgetItemsFrom(fp)
  if (!(await deliver(fp, notice))) keepPending(pendingFile(), fp, notice, Date.now())
  ctx.onTrustChanged()
  send('lan:itemsChanged', null)
  return { ok: true, name: person.label }
}

async function onRevoke({ header }, conn) {
  const told = verifyRevoke(header, {
    trusted: await readTrusted(),
    me: ctx.identity.pub.fingerprint,
    now: Date.now()
  })
  if (told) conn.send({ type: 'revoke-ack', sig: signAck(ctx.identity.priv, ackFields(header)) })
  conn.close()
  if (told) send('lan:revoked', told)
}

async function onPeerSeen(fp) {
  const notice = takePending(pendingFile(), fp, Date.now())
  if (notice && !(await deliver(fp, notice))) keepPending(pendingFile(), fp, notice, Date.now())
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
