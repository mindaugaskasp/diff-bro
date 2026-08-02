// Post a PR review as the REVIEW identity, not the author's.
//
// GitHub refuses "Request changes" on your own pull request, so an automated
// reviewer needs a second identity or it can only ever leave a comment. This
// resolves one, checks it is not the PR author, and downgrades loudly rather
// than silently posting something weaker than asked for.
//
// Usage:
//   node scripts/pr-review.mjs <pr> --event REQUEST_CHANGES --body-file review.md
//
// Identity, first match wins:
//   DIFFBRO_REVIEW_TOKEN   a PAT / installation token for the reviewer
//   DIFFBRO_REVIEW_USER    a second account already in `gh auth login`
//
// See specs/README.md → Landing it.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const EVENTS = ['REQUEST_CHANGES', 'COMMENT', 'APPROVE']

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

// gh inherits the ambient token unless one is named, so an empty GH_TOKEN would
// silently fall back to the author's account — hence the explicit delete.
function gh(args, token) {
  const env = { ...process.env }
  delete env.GH_TOKEN
  delete env.GITHUB_TOKEN
  if (token) env.GH_TOKEN = token
  // stderr is captured, not inherited: identityOf expects a 403 and handles it,
  // and gh printing that failure would read as the review having gone wrong.
  return execFileSync('gh', args, {
    env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

function reviewToken() {
  if (process.env.DIFFBRO_REVIEW_TOKEN) return process.env.DIFFBRO_REVIEW_TOKEN
  const user = process.env.DIFFBRO_REVIEW_USER
  if (!user) return null
  try {
    return gh(['auth', 'token', '--user', user])
  } catch {
    throw new Error(`DIFFBRO_REVIEW_USER=${user} is not a logged-in gh account (gh auth login).`)
  }
}

// An App installation token cannot call /user — it is a bot by construction, so
// null here means "not the human author" rather than "unknown, be careful".
function identityOf(token) {
  try {
    return gh(['api', 'user', '--jq', '.login'], token)
  } catch {
    return null
  }
}

function parseArgs() {
  const pr = process.argv[2]
  const event = arg('event', 'COMMENT').toUpperCase()
  const bodyFile = arg('body-file')
  if (!pr || !/^\d+$/.test(pr))
    throw new Error('Usage: pr-review.mjs <pr> [--event E] --body-file F')
  if (!EVENTS.includes(event)) throw new Error(`--event must be one of ${EVENTS.join(', ')}`)
  if (!bodyFile) throw new Error('--body-file is required')
  return { pr, event, bodyFile }
}

/** The identity to post as, and the event it is actually allowed to post. */
function resolveReviewer(event, author) {
  let token = reviewToken()
  let who = 'the active gh account'
  if (token) {
    const login = identityOf(token)
    who = login ?? 'the app installation'
    // The whole reason this script exists: same identity means GitHub will
    // reject anything stronger than a comment.
    if (login && login === author) {
      process.stderr.write(
        `! review identity (${login}) is the PR author — GitHub allows only a comment.\n`
      )
      token = null
    }
  }
  if (token || event === 'COMMENT') return { token, who, effective: event }
  process.stderr.write(
    `! no separate review identity configured, so "${event}" was downgraded to a comment.\n` +
      `  Set DIFFBRO_REVIEW_TOKEN or DIFFBRO_REVIEW_USER — see specs/README.md.\n`
  )
  return { token, who, effective: 'COMMENT' }
}

function main() {
  const { pr, event, bodyFile } = parseArgs()
  const body = readFileSync(bodyFile, 'utf-8')
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const author = gh(['pr', 'view', pr, '--json', 'author', '--jq', '.author.login'])
  const { token, who, effective } = resolveReviewer(event, author)

  const out = gh(
    [
      'api',
      `repos/${repo}/pulls/${pr}/reviews`,
      '-X',
      'POST',
      '-f',
      `event=${effective}`,
      '-f',
      `body=${body}`,
      '--jq',
      '.html_url'
    ],
    token
  )
  process.stdout.write(`${effective} posted by ${who}: ${out}\n`)
}

try {
  main()
} catch (err) {
  process.stderr.write(`${err.message}\n`)
  process.exit(1)
}
