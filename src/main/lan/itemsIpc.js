import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { isItemId, listItems, readItem, removeItem, removeItemsFrom, writeItem } from './lanInbox'
import {
  ackResult,
  cleanFps,
  deliveryReport,
  isValidItemEntry,
  itemSummary,
  resolveRecipients,
  snippetEntry
} from './lanItems'
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
const TRUST_REFRESH_MS = 30_000
const limit = createRateLimit({ limit: 10, windowMs: 60_000 })

async function openStored(record) {
  const opened = openSealedWith(record.sealed, await decryptionIdentities(), await readTrusted())
  if (!opened.ok || !isValidItemEntry(opened.entry) || opened.signer !== record.fromFp) return null
  return { entry: opened.entry, from: opened.from, fp: opened.signer }
}

function parseSealed(body) {
  try {
    return JSON.parse(body.toString('utf8'))
  } catch {
    return null
  }
}

async function onItem({ header, body }, conn) {
  const isTrusted = (await readTrusted()).some((t) => t.fingerprint === header.fp)
  if (!isTrusted || !body || !limit.allow(header.fp, Date.now())) return conn.destroy()
  const ack = (ok, reason) => {
    conn.send({ type: 'item-ack', ok, ...(reason ? { reason } : {}) })
    conn.close()
  }
  const record = { sealed: parseSealed(body), fromFp: header.fp }
  const opened = record.sealed && (await openStored(record))
  if (!opened) return ack(false, 'bad-item')
  const now = Date.now()
  const stored = writeItem(inboxDir(), { ...record, now })
  if (stored.error) return ack(false, stored.error)
  ack(true)
  send('lan:itemArrived', itemSummary({ id: stored.id, receivedAt: now }, opened))
}

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
  if (record) removeItem(inboxDir(), id)
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

function deliver(fp, header, body) {
  const endpoint = lan?.endpointOf(fp)
  if (!endpoint) return Promise.resolve({ fp, ok: false, reason: 'offline' })
  return new Promise((resolve) => {
    const done = (result) => resolve({ fp, ...result })
    const timer = setTimeout(() => done({ ok: false, reason: 'timeout' }), ACK_MS)
    connectTo(endpoint, {
      onFrame: ({ header: h }, conn) => {
        clearTimeout(timer)
        conn.close()
        done(ackResult(h))
      },
      onClose: () => done({ ok: false, reason: 'closed' })
    })
      .then((conn) => conn.send(header, body))
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
  const header = { type: 'item', kind: entry.kind, name: entry.name, fp: pub.fingerprint }
  const results = await Promise.all(fps.map((fp) => deliver(fp, header, body)))
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
  setInterval(() => refreshTrustedFps().catch(() => {}), TRUST_REFRESH_MS)
}

export function registerItemsIpc() {
  ipcMain.handle('lan:items', () => waitingItems())
  ipcMain.handle('lan:openItem', (_e, id) => openItem(String(id)))
  ipcMain.handle('lan:declineItem', (_e, id) => {
    if (isItemId(id)) removeItem(inboxDir(), id)
    send('lan:itemsChanged', null)
    return { ok: true }
  })
  ipcMain.handle('lan:send', (_e, req) => sendItem(req))
}
