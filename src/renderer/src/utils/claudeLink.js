// Recognising a claude.ai link in snippet text. Only the categorisation happens
// here; opening is gated by the main-process allowlist (src/main/links.js) and
// never by these loose matches.

const CLAUDE_LINK_RE = /^https:\/\/(www\.)?claude\.ai\/\S*$/i

/** Whether the text is nothing but a claude.ai URL — a stored artifact or chat. */
export const isClaudeLink = (t) => !t.includes('\n') && CLAUDE_LINK_RE.test(t)

const CLAUDE_URL_G = /https:\/\/(?:www\.)?claude\.ai\/\S*/i

/** First claude.ai URL embedded anywhere, for the row's "Open link" action. */
export const firstClaudeUrl = (t) => String(t ?? '').match(CLAUDE_URL_G)?.[0] ?? null
