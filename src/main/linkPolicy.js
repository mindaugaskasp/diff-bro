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
