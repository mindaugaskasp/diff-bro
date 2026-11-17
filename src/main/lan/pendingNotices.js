import { readFileSync, renameSync, writeFileSync } from 'fs'
import { REVOKE_TTL_MS } from './revoke'

export function readPending(file, now) {
  try {
    const all = JSON.parse(readFileSync(file, 'utf8'))
    return Object.fromEntries(
      Object.entries(all ?? {}).filter(([, n]) => n && now - n.at <= REVOKE_TTL_MS)
    )
  } catch {
    return {}
  }
}

function writePending(file, notices) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(notices), { mode: 0o600 })
  renameSync(tmp, file)
}

export function keepPending(file, to, frame, now) {
  writePending(file, { ...readPending(file, now), [to]: frame })
}

export function takePending(file, to, now) {
  const all = readPending(file, now)
  const frame = all[to] ?? null
  if (frame) {
    delete all[to]
    writePending(file, all)
  }
  return frame
}
