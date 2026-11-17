import { createHash, randomUUID } from 'crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { MAX_TTL_MS } from '../sealingTtl'
import { join } from 'path'

export const MAX_WAITING = 50
export const MAX_PER_SENDER = 10
const SEEN = 'seen.json'
const FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/
const FP = /^[0-9a-f]{32}$/

export const isItemId = (id) => typeof id === 'string' && FILE.test(`${id}.json`)

function ids(dir) {
  try {
    return readdirSync(dir)
      .map((name) => FILE.exec(name)?.[1])
      .filter(Boolean)
  } catch {
    return []
  }
}

const digestOf = (sealed) => createHash('sha256').update(JSON.stringify(sealed)).digest('hex')
const metaPath = (dir, id) => join(dir, `${id}.meta.json`)

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 })
  renameSync(tmp, file)
}

const metas = (dir) => ids(dir).map((id) => ({ id, ...readJson(metaPath(dir, id), {}) }))

// Opened or declined items stay refused until they would have expired, so a replay is not a new offer.
function liveSeen(dir, now) {
  const seen = readJson(join(dir, SEEN), {})
  return Object.fromEntries(Object.entries(seen).filter(([, until]) => until > now))
}

function refusal(dir, { digest, fromFp, now }) {
  const waiting = metas(dir)
  if (waiting.some((m) => m.digest === digest) || liveSeen(dir, now)[digest]) return 'duplicate'
  if (waiting.length >= MAX_WAITING) return 'inbox-full'
  if (waiting.filter((m) => m.fromFp === fromFp).length >= MAX_PER_SENDER) return 'sender-full'
  return null
}

export function writeItem(dir, { sealed, fromFp, now, expiresAt = now + MAX_TTL_MS }) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const digest = digestOf(sealed)
  const error = refusal(dir, { digest, fromFp, now })
  if (error) return { error }
  const id = randomUUID()
  writeJson(metaPath(dir, id), { fromFp, digest, expiresAt })
  writeJson(join(dir, `${id}.json`), { v: 1, id, fromFp, receivedAt: now, sealed })
  return { id }
}

export function readItem(dir, id) {
  if (!isItemId(id)) return null
  try {
    const record = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'))
    return record?.id === id && FP.test(record.fromFp ?? '') && record.sealed ? record : null
  } catch {
    return null
  }
}

export const listItems = (dir) =>
  ids(dir)
    .map((id) => readItem(dir, id))
    .filter(Boolean)

export function removeItem(dir, id, now = Date.now()) {
  if (!isItemId(id)) return
  const meta = readJson(metaPath(dir, id), null)
  if (meta?.digest)
    writeJson(join(dir, SEEN), { ...liveSeen(dir, now), [meta.digest]: meta.expiresAt })
  rmSync(join(dir, `${id}.json`), { force: true })
  rmSync(metaPath(dir, id), { force: true })
}

export function removeItemsFrom(dir, fromFp) {
  for (const item of listItems(dir)) if (item.fromFp === fromFp) removeItem(dir, item.id)
}
