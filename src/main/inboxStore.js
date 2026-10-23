// The MCP process only creates proposals, the app only deletes them: never two writers.
import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { vaultDecrypt, vaultEncrypt } from './vaultCrypt'

export const MAX_PENDING = 50
export const PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const PROPOSAL_KINDS = ['snippet', 'comparison']

const FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/

const proposalAad = ({ id, kind, createdAt, expiresAt }) =>
  ['inbox', id, kind, createdAt, expiresAt].join('|')

const proposalIds = (dir) => {
  try {
    return readdirSync(dir)
      .map((name) => FILE.exec(name)?.[1])
      .filter(Boolean)
  } catch {
    return []
  }
}

const isProposalId = (id) => typeof id === 'string' && FILE.test(`${id}.json`)

/**
 * @param {string} dir
 * @param {Buffer} key
 * @param {{ kind: string, body: object, now: number }} proposal
 * @returns {{ id: string }|{ error: 'inbox-full' }}
 */
export function writeProposal(dir, key, { kind, body, now }) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (proposalIds(dir).length >= MAX_PENDING) return { error: 'inbox-full' }
  const meta = { id: randomUUID(), kind, createdAt: now, expiresAt: now + PROPOSAL_TTL_MS }
  const box = vaultEncrypt(key, JSON.stringify(body), proposalAad(meta))
  const tmp = join(dir, `.${meta.id}.tmp`)
  writeFileSync(tmp, JSON.stringify({ v: 1, ...meta, ...box }), { mode: 0o600 })
  renameSync(tmp, join(dir, `${meta.id}.json`))
  return { id: meta.id }
}

function openProposal(dir, key, id) {
  try {
    const record = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'))
    if (record.id !== id || !PROPOSAL_KINDS.includes(record.kind)) return null
    const plaintext = vaultDecrypt(key, record, proposalAad(record))
    return plaintext === null ? null : { ...record, body: JSON.parse(plaintext) }
  } catch {
    return null
  }
}

export function discardProposal(dir, id) {
  if (!isProposalId(id)) return false
  rmSync(join(dir, `${id}.json`), { force: true })
  return true
}

/**
 * Oldest first; expired or tampered files are deleted on the way (the app owns deletion).
 * @returns {{ id: string, kind: string, createdAt: number, expiresAt: number, body: object }[]}
 */
export function listProposals(dir, key, now) {
  const live = []
  for (const id of proposalIds(dir)) {
    const proposal = openProposal(dir, key, id)
    if (proposal && proposal.expiresAt > now) live.push(proposal)
    else discardProposal(dir, id)
  }
  return live
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ id, kind, createdAt, expiresAt, body }) => ({ id, kind, createdAt, expiresAt, body }))
}

/** What the Home list shows: the bodies stay in main until one is opened. */
export function proposalSummary({ id, kind, createdAt, expiresAt, body }) {
  return {
    id,
    kind,
    createdAt,
    expiresAt,
    name: body.name,
    note: body.note ?? '',
    language: body.language ?? null,
    tags: body.tags ?? []
  }
}

export function readProposal(dir, key, id, now) {
  if (!isProposalId(id)) return null
  const proposal = openProposal(dir, key, id)
  return proposal && proposal.expiresAt > now ? proposal : null
}
