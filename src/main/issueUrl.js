// The origin and path are fixed here and the renderer passes a message, never a
// URL, so this stays a closed surface (rule 7). The message is anonymised first:
// this address leaves the machine.
import { redactSensitive } from './logRedact'

export const ISSUE_BASE = 'https://github.com/mindaugaskasp/diff-bro/issues/new'
export const MAX_URL = 2000

const MAX_TITLE = 120

function cleanTitle(raw, homeDir) {
  if (typeof raw !== 'string') return ''
  const text = redactSensitive(raw, { homeDir })
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1)}…` : text
}

function fullBody(title, env) {
  return [
    '### What happened',
    '',
    title || '_Describe the problem here._',
    '',
    '### Steps to reproduce',
    '',
    '1. ',
    '',
    ...env,
    '',
    '### Log',
    '',
    'Paste the log here — the error dialog has a Copy log button.',
    ''
  ].join('\n')
}

function envLines(appVersion, platform) {
  return [
    '### Environment',
    '',
    `- Diff Bro ${appVersion || 'unknown'}`,
    `- ${platform || 'unknown'}`
  ]
}

function urlFor(title, body) {
  const params = new URLSearchParams()
  if (title) params.set('title', title)
  params.set('body', body)
  return `${ISSUE_BASE}?${params}`
}

/**
 * @param {{title?: unknown, appVersion?: string, platform?: string, homeDir?: string}} [options]
 * @returns {string} a fixed-origin issue URL with an anonymised title and body
 */
export function buildIssueUrl({ title, appVersion, platform, homeDir } = {}) {
  const safeTitle = cleanTitle(title, homeDir)
  const env = envLines(appVersion, platform)
  const full = urlFor(safeTitle, fullBody(safeTitle, env))
  return full.length <= MAX_URL ? full : urlFor(safeTitle, env.join('\n'))
}
