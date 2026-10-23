import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  MAX_PENDING,
  PROPOSAL_TTL_MS,
  discardProposal,
  listProposals,
  proposalSummary,
  readProposal,
  writeProposal
} from '../../src/main/inboxStore'

const KEY = randomBytes(32)
const body = { name: 'Fix', note: 'why', content: 'select 1', language: 'sql', tags: ['db'] }
let dir

beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), 'inbox-test-')), 'inbox')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('claude inbox', () => {
  it('writes a proposal that the app can list and read back', () => {
    const { id } = writeProposal(dir, KEY, { kind: 'snippet', body, now: 1000 })
    const [listed] = listProposals(dir, KEY, 2000)
    expect(proposalSummary(listed)).toEqual({
      id,
      kind: 'snippet',
      createdAt: 1000,
      expiresAt: 1000 + PROPOSAL_TTL_MS,
      name: 'Fix',
      note: 'why',
      language: 'sql',
      tags: ['db']
    })
    expect(readProposal(dir, KEY, id, 2000).body).toEqual(body)
  })

  it('leaves no temp file behind and never stores the body in the clear', () => {
    const { id } = writeProposal(dir, KEY, { kind: 'snippet', body, now: 1 })
    expect(readdirSync(dir)).toEqual([`${id}.json`])
    expect(readFileSync(join(dir, `${id}.json`), 'utf8')).not.toContain('select 1')
  })

  it('drops a proposal whose metadata was tampered with', () => {
    const { id } = writeProposal(dir, KEY, { kind: 'snippet', body, now: 1 })
    const file = join(dir, `${id}.json`)
    const record = JSON.parse(readFileSync(file, 'utf8'))
    writeFileSync(file, JSON.stringify({ ...record, expiresAt: record.expiresAt + 1e9 }))
    expect(listProposals(dir, KEY, 2)).toEqual([])
    expect(readdirSync(dir)).toEqual([])
  })

  it('drops a proposal sealed under another key', () => {
    writeProposal(dir, randomBytes(32), { kind: 'snippet', body, now: 1 })
    expect(listProposals(dir, KEY, 2)).toEqual([])
  })

  it('expires a proposal after a week', () => {
    const { id } = writeProposal(dir, KEY, { kind: 'snippet', body, now: 0 })
    expect(readProposal(dir, KEY, id, PROPOSAL_TTL_MS)).toBeNull()
    expect(listProposals(dir, KEY, PROPOSAL_TTL_MS)).toEqual([])
  })

  it('refuses a new proposal once the inbox is full', () => {
    for (let i = 0; i < MAX_PENDING; i++) writeProposal(dir, KEY, { kind: 'snippet', body, now: i })
    expect(writeProposal(dir, KEY, { kind: 'snippet', body, now: 99 })).toEqual({
      error: 'inbox-full'
    })
  })

  it('lists oldest first', () => {
    const b = writeProposal(dir, KEY, { kind: 'comparison', body, now: 20 })
    const a = writeProposal(dir, KEY, { kind: 'snippet', body, now: 10 })
    expect(listProposals(dir, KEY, 30).map((p) => p.id)).toEqual([a.id, b.id])
  })

  it('refuses to touch a file that is not a proposal id', () => {
    writeFileSync(join(dir, '..', 'vault.json'), '{}')
    expect(discardProposal(dir, '../vault')).toBe(false)
    expect(readProposal(dir, KEY, '../vault', 1)).toBeNull()
    expect(readFileSync(join(dir, '..', 'vault.json'), 'utf8')).toBe('{}')
  })

  it('discards a proposal', () => {
    const { id } = writeProposal(dir, KEY, { kind: 'snippet', body, now: 1 })
    expect(discardProposal(dir, id)).toBe(true)
    expect(listProposals(dir, KEY, 2)).toEqual([])
  })

  it('lists nothing when the inbox does not exist yet', () => {
    expect(listProposals(join(dir, 'nope'), KEY, 1)).toEqual([])
  })
})
