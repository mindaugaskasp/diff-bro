// The pure allowlist policy for opening a stored link outside the offline
// sandbox. Kept free of electron imports so it stays unit-testable, the same
// core-vs-glue split sealing.js / share.js use — links.js is the thin IPC glue
// over this.

// True only for https://claude.ai and its subdomains. Parsed with the URL API so
// tricks like `https://claude.ai@evil.com`, `https://claude.ai.evil.com`,
// `http://claude.ai` and userinfo/port games all resolve to their real host and
// fail. `endsWith('.claude.ai')` requires a dot boundary, so `notclaude.ai` and
// `claude.ai.evil.com` are rejected.
export function isClaudeUrl(raw) {
  let u
  try {
    u = new URL(String(raw ?? ''))
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return host === 'claude.ai' || host.endsWith('.claude.ai')
}

// A URL snippet's link. Wider than the claude.ai allowlist, so the fence is the
// SCHEME: shell.openExternal will otherwise open a local file, run a script
// handler, or launch another application from a crafted string. Only http(s)
// reaches the browser, and the user still confirms (links.js).
const MAX_URL_LENGTH = 2048

export function isSafeExternalUrl(raw) {
  if (typeof raw !== 'string') return false
  const text = raw.trim()
  if (!text || text.length > MAX_URL_LENGTH) return false
  try {
    const { protocol } = new URL(text)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
