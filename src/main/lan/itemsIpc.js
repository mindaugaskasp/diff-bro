import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { isItemId, listItems, readItem, removeItem, removeItemsFrom, writeItem } from './lanInbox'
import {
  cleanFps,
  deliveryReport,
  isValidItemEntry,
  itemHeader,
  itemSummary,
  resolveRecipients,
  snippetEntry,
  verifiedAck
} from './lanItems'
import { digestOf } from './acks'
import { createItemReceiver } from './itemReceiver'
import { FRAME_LIMITS } from './frames'
import { createRateLimit } from './rateLimit'
import { connectTo } from './server'
import { openSealedWith, sealEntry, ttlError } from '../sealing'
import { readTrusted } from '../trustedKeys'
import { decryptionIdentities, getIdentity } from '../share'
import { readSnippetStore } from '../appData'
import { entriesOf, isSecretEntry, parseStore } from '../storeEntries'

const ACK_MS = 30_000
const inboxDir = () => join(app.getPath('userData'), 'lan-inbox')
const send = (channel, payload) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

let lan = null
let trustedFps = new Set()
let trustRefresh = null
const TRUST_REFRESH_MS = 30_000

async function openStored(record) {
  const opened = openSealedWith(record.sealed, await decryptionIdentities(), await readTrusted())
  if (!opened.ok || !isValidItemEntry(opened.entry) || opened.signer !== record.fromFp) return null
  return { entry: opened.entry, from: opened.from, fp: opened.signer }
}

const onItem = createItemReceiver({
  trustedFps: () => trustedFps,
  open: openStored,
  store: (record) => writeItem(inboxDir(), record),
  notify: (summary) => send('lan:itemArrived', summary),
  signingKey: async () => (await getIdentity()).priv,
  senderLimit: createRateLimit({ limit: 10, windowMs: 60_000 }),
  remoteLimit: createRateLimit({ limit: 30, windowMs: 60_000 })
})

async function waitingItems() {
  const out = []
  for (const record of listItems(inboxDir())) {
    const opened = await openStored(record)
    if (opened) out.push(itemSummary(record, opened))
    else removeItem(inboxDir(), record.id)
  }
  return out.sort((a, b) => a.receivedAt - b.receivedAt)
}

async function openItem(id) {
  const record = isItemId(id) ? readItem(inboxDir(), id) : null
  const opened = record && (await openStored(record))
  if (record) removeItem(inboxDir(), id, Date.now())
  return opened ? { ok: true, ...opened } : { error: 'gone' }
}

function isSecretSnippet(id) {
  return entriesOf(parseStore(readSnippetStore())).some((e) => e.id === id && isSecretEntry(e))
}

function entryFor(req) {
  if (req?.snippet) {
    const { id, name, content, language, tags } = req.snippet
    if (typeof id !== 'string' || isSecretSnippet(id)) return { error: 'secret' }
    return { entry: snippetEntry({ name, content, language, tags }, Date.now()) }
  }
  return { entry: req?.diff ? { ...req.diff, kind: 'diff' } : null }
}

function deliver(recipient, header, body) {
  const fp = recipient.fingerprint
  const endpoint = lan?.endpointOf(fp)
  if (!endpoint) return Promise.resolve({ fp, ok: false, reason: 'offline' })
  const check = { signKey: recipient.sign, digest: digestOf(body) }
  return new Promise((resolve) => {
    let conn = null
    const done = (result) => resolve({ fp, ...result })
    const timer = setTimeout(() => {
      conn?.destroy()
      done({ ok: false, reason: 'timeout' })
    }, ACK_MS)
    connectTo(endpoint, {
      onFrame: ({ header: h }, c) => {
        clearTimeout(timer)
        c.close()
        done(verifiedAck(h, check))
      },
      onClose: () => done({ ok: false, reason: 'closed' })
    })
      .then((c) => {
        conn = c
        c.send(header, body)
      })
      .catch(() => done({ ok: false, reason: 'offline' }))
  })
}

async function sendItem(req) {
  const fps = cleanFps(req?.fps)
  const { entry, error } = entryFor(req)
  if (error) return { error }
  if (!fps.length || !isValidItemEntry(entry) || ttlError(entry)) return { error: 'bad-request' }
  const trusted = await readTrusted()
  const resolved = resolveRecipients(fps, trusted)
  if (resolved.error) return resolved
  const { priv, pub } = await getIdentity()
  const sender = { priv, fingerprint: pub.fingerprint }
  const body = Buffer.from(JSON.stringify(sealEntry(entry, sender, resolved.recipients)))
  if (body.length > FRAME_LIMITS.item) return { error: 'too-large' }
  const header = itemHeader(pub.fingerprint)
  const results = await Promise.all(resolved.recipients.map((r) => deliver(r, header, body)))
  return deliveryReport(results, trusted)
}

export const forgetItemsFrom = (fp) => removeItemsFrom(inboxDir(), fp)

export async function refreshTrustedFps() {
  trustedFps = new Set((await readTrusted()).map((t) => t.fingerprint))
}

export function setUpItems(service) {
  lan = service
  lan.accept('item', (header) => trustedFps.has(header.fp))
  lan.on('item', onItem)
  refreshTrustedFps().catch(() => {})
  clearInterval(trustRefresh)
  trustRefresh = setInterval(() => refreshTrustedFps().catch(() => {}), TRUST_REFRESH_MS)
}

export function registerItemsIpc() {
  ipcMain.handle('lan:items', () => waitingItems())
  ipcMain.handle('lan:openItem', (_e, id) => openItem(String(id)))
  ipcMain.handle('lan:declineItem', (_e, id) => {
    if (isItemId(id)) removeItem(inboxDir(), id, Date.now())
    send('lan:itemsChanged', null)
    return { ok: true }
  })
  ipcMain.handle('lan:send', (_e, req) => sendItem(req))
}
