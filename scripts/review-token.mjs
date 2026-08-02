// Mint a GitHub App installation token for the PR reviewer identity.
//
// An installation token cannot be copied out of the UI: it is exchanged for a
// short-lived JWT signed with the app's private key, and expires in an hour.
// Prints the token on stdout and nothing else, so it can be captured directly:
//
//   DIFFBRO_REVIEW_TOKEN=$(node scripts/review-token.mjs)
//
// Env:
//   DIFFBRO_REVIEW_APP_ID   the App ID from the app's settings page
//   DIFFBRO_REVIEW_KEY      path to the downloaded .pem — keep it OUT of this repo
//   DIFFBRO_REVIEW_REPO     owner/name (default: this repo's origin)
//
// See specs/README.md → The review identity.

import { createSign } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const b64url = (buf) => Buffer.from(buf).toString('base64url')

// App endpoints require `Authorization: Bearer <JWT>`, which is why this signs
// and fetches directly rather than going through `gh api` (it sends `token`).
function appJwt(appId, pem) {
  const now = Math.floor(Date.now() / 1000)
  // Backdated by a minute so a slow clock on this machine is not read as a
  // token issued in the future, which GitHub rejects outright.
  const claims = { iat: now - 60, exp: now + 540, iss: String(appId) }
  const signing = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify(claims)
  )}`
  const signer = createSign('RSA-SHA256')
  signer.update(signing)
  return `${signing}.${signer.sign(pem, 'base64url')}`
}

async function api(path, jwt, method = 'GET') {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} on ${path}: ${body.message ?? 'unknown error'}`)
  }
  return body
}

function need(name, hint) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set — ${hint}`)
  return v
}

function currentRepo() {
  if (process.env.DIFFBRO_REVIEW_REPO) return process.env.DIFFBRO_REVIEW_REPO
  return execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
    encoding: 'utf-8'
  }).trim()
}

async function main() {
  const appId = need('DIFFBRO_REVIEW_APP_ID', 'find it on the app’s settings page')
  const keyPath = need('DIFFBRO_REVIEW_KEY', 'the path to the app’s .pem private key')
  const pem = readFileSync(keyPath, 'utf-8')
  const jwt = appJwt(appId, pem)

  const repo = currentRepo()
  // Ask which installation covers THIS repo rather than taking the first one:
  // an app installed on several repos has several.
  const installation = await api(`/repos/${repo}/installation`, jwt)
  const token = await api(`/app/installations/${installation.id}/access_tokens`, jwt, 'POST')
  process.stdout.write(`${token.token}\n`)
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`)
  process.exit(1)
})
