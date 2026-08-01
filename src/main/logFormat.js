// Pure helpers for the local error log (fs/IPC glue in logger.js). LOCAL ONLY.

const LOG_PREFIX = 'diffbro-'
const LOG_SUFFIX = '.log'

// Field caps: a single error (possibly from a compromised renderer, per the
// threat model) must not be able to bloat the file. Truncate, don't reject.
const MAX_MESSAGE = 4_000
const MAX_STACK = 16_000
const MAX_CONTEXT = 1_000

function oneLine(value, max) {
  const s = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? `${s.slice(0, max)}…(truncated)` : s
}

function clampStack(stack) {
  const s = String(stack ?? '')
  return s.length > MAX_STACK ? `${s.slice(0, MAX_STACK)}\n…(truncated)` : s
}

// `diffbro-2026-07-23.log` — one file per calendar day (local time).
export function dailyLogName(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${LOG_PREFIX}${y}-${m}-${d}${LOG_SUFFIX}`
}

export function isLogFileName(name) {
  return typeof name === 'string' && name.startsWith(LOG_PREFIX) && name.endsWith(LOG_SUFFIX)
}

// One block per error, always starting at column 0 with "[timestamp]" (capLog
// splits on that).
export function formatLogEntry(record = {}, now = new Date()) {
  const source = oneLine(record.source || 'app', 40)
  const head = `[${now.toISOString()}] [${source}] ${oneLine(record.message, MAX_MESSAGE)}`
  const lines = [head]
  if (record.context) lines.push(`  context: ${oneLine(record.context, MAX_CONTEXT)}`)
  if (record.appVersion || record.platform) {
    lines.push(`  env: ${oneLine(`${record.appVersion ?? ''} ${record.platform ?? ''}`, 100)}`)
  }
  if (record.stack) {
    lines.push(
      clampStack(record.stack)
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n')
    )
  }
  return lines.join('\n') + '\n'
}

// Drop whole oldest entries (each starts with "[") until the day's file fits.
export function capLog(existing, entry, maxBytes) {
  let combined = (existing ?? '') + entry
  if (combined.length <= maxBytes) return combined
  if (entry.length >= maxBytes) return entry
  while (combined.length > maxBytes) {
    const next = combined.indexOf('\n[', 1)
    if (next === -1) break
    combined = combined.slice(next + 1)
  }
  return combined
}

// Files to delete: all but the most recent keepDays (name sort is chronological).
export function staleLogFiles(names, keepDays = 7) {
  const logs = names.filter(isLogFileName).sort()
  if (logs.length <= keepDays) return []
  return logs.slice(0, logs.length - keepDays)
}
