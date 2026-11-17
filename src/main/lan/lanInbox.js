import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

export const MAX_WAITING = 50
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

export function writeItem(dir, { sealed, fromFp, now }) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (ids(dir).length >= MAX_WAITING) return { error: 'inbox-full' }
  const id = randomUUID()
  const tmp = join(dir, `.${id}.tmp`)
  writeFileSync(tmp, JSON.stringify({ v: 1, id, fromFp, receivedAt: now, sealed }), { mode: 0o600 })
  renameSync(tmp, join(dir, `${id}.json`))
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

export function removeItem(dir, id) {
  if (isItemId(id)) rmSync(join(dir, `${id}.json`), { force: true })
}

export function removeItemsFrom(dir, fromFp) {
  for (const item of listItems(dir)) if (item.fromFp === fromFp) removeItem(dir, item.id)
}
