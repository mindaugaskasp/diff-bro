// Pure helpers for the local error log — no Electron, no fs, so the formatting,
// daily-rotation naming, size cap, and retention logic stay unit-testable. The
// fs/IPC glue lives in logger.js (CLAUDE.md: keep pure logic out of
// Electron-importing files). The log is LOCAL ONLY — nothing here ever leaves
// the machine; it exists so a user can paste it into a GitHub issue by choice.

const LOG_PREFIX = 'diffbro-'
const LOG_SUFFIX = '.log'

// Field caps: a single error (possibly from a compromised renderer, per the
// threat model) must not be able to bloat the file. Truncate, don't reject.
const MAX_MESSAGE = 4_000
const MAX_STACK = 16_000
const MAX_CONTEXT = 1_000

function oneLine(value, max) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim()
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

// One newline-terminated block per error. Kept greppable: an entry always starts
// at column 0 with "[timestamp]", which capLog relies on to split on boundaries.
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

// Replace the user's home directory with ~ so a pasted log doesn't leak the
// account name / full home path. Applied to the whole entry before it's written.
export function redactHome(text, homeDir) {
  if (!homeDir) return text
  // Escape regex metacharacters in the path, match all occurrences.
  const escaped = homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(text).replace(new RegExp(escaped, 'g'), '~')
}

// Keep one day's file bounded too: if appending would blow the cap, drop whole
// oldest entries (each starts with "[") until it fits. Never splits an entry.
export function capLog(existing, entry, maxBytes) {
  let combined = (existing ?? '') + entry
  if (combined.length <= maxBytes) return combined
  // If a single entry already exceeds the cap, keep just that entry.
  if (entry.length >= maxBytes) return entry
  while (combined.length > maxBytes) {
    // Drop everything up to the second entry's start.
    const next = combined.indexOf('\n[', 1)
    if (next === -1) break
    combined = combined.slice(next + 1)
  }
  return combined
}

// Given the log directory's file names, return the ones to delete: anything
// that isn't one of the most recent `keepDays` daily files. Sorting is by name,
// which is chronological because the date is zero-padded ISO.
export function staleLogFiles(names, keepDays = 7) {
  const logs = names.filter(isLogFileName).sort()
  if (logs.length <= keepDays) return []
  return logs.slice(0, logs.length - keepDays)
}
