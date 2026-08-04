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

// The mail hand-off. `attach` is refused rather than ignored: it was never
// standardised, no mainstream client honours it, and the clients that once did
// turned a mailto: into "read this local file and send it". A URL carrying one
// did not come from buildMailto, so it is treated as hostile, not tidied up.
const MAX_MAILTO_URL_LENGTH = 4000
const BANNED_MAILTO_PARAMS = ['attach', 'attachment']

// eslint-disable-next-line no-control-regex
const HAS_CONTROL = /[\u0000-\u001f\u007f]/

// mailto: is a non-special scheme, so the addressee sits in `pathname` exactly
// as written — `a%40b.co` is as valid as `a@b.co`, and it must decode before the
// check or a legitimate percent-encoded URL reads as address-less. A malformed
// escape is not something we hand to the OS.
const hasAddressee = (url) => {
  try {
    return decodeURIComponent(url.pathname).includes('@')
  } catch {
    return false
  }
}

const carriesBannedParam = (url) =>
  [...url.searchParams.keys()].some((k) => BANNED_MAILTO_PARAMS.includes(k.toLowerCase()))

export function isSafeMailtoUrl(raw) {
  if (typeof raw !== 'string') return false
  const text = raw.trim()
  if (!text || text.length > MAX_MAILTO_URL_LENGTH || HAS_CONTROL.test(text)) return false
  let url
  try {
    url = new URL(text)
  } catch {
    return false
  }
  return url.protocol === 'mailto:' && hasAddressee(url) && !carriesBannedParam(url)
}
