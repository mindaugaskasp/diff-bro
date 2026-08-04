import { describe, expect, it } from 'vitest'
import {
  MAX_KEEP_HOURS,
  sealableFromDraft,
  sealableFromEntry,
  sealedWindow,
  ttlSpan
} from '../../../src/renderer/src/utils/shareEntry'

const NOW = Date.UTC(2026, 7, 4, 12)
const HOUR = 3600_000

describe('ttlSpan', () => {
  it('clamps to the one-week ceiling, matching sealing.js MAX_TTL_MS', () => {
    expect(ttlSpan(1000)).toBe(MAX_KEEP_HOURS * HOUR)
  })

  it('clamps a zero or negative request to the floor rather than expiring at once', () => {
    expect(ttlSpan(0)).toBe(1 * HOUR) // 0 is falsy → the default
    expect(ttlSpan(-5)).toBe(0.1 * HOUR)
  })
})

describe('sealedWindow', () => {
  it('keeps the senders own window so both copies die together', () => {
    const entry = { createdAt: NOW - HOUR, expiresAt: NOW + HOUR }
    expect(sealedWindow(entry, NOW)).toEqual(entry)
  })

  // Sealing demands a finite window, and a kept diff has none to send.
  it('gives a never-expiring diff a fresh full window', () => {
    expect(sealedWindow({ createdAt: NOW - HOUR, expiresAt: null }, NOW)).toEqual({
      createdAt: NOW,
      expiresAt: NOW + MAX_KEEP_HOURS * HOUR
    })
  })
})

describe('sealableFromEntry', () => {
  const entry = { name: 'a ↔ b', createdAt: NOW, expiresAt: NOW + HOUR, tags: ['prod', 'imported'] }

  it('carries name, window, payload and tags', () => {
    expect(sealableFromEntry(entry, { left: 1 }, NOW)).toEqual({
      name: 'a ↔ b',
      createdAt: NOW,
      expiresAt: NOW + HOUR,
      snapshot: { left: 1 },
      tags: ['prod']
    })
  })

  // Local-only: sending it would make a re-shared diff accumulate them.
  it('never sends the auto "imported" tag', () => {
    expect(sealableFromEntry(entry, {}, NOW).tags).not.toContain('imported')
  })
})

describe('sealableFromDraft', () => {
  it('derives the window from the requested TTL', () => {
    const out = sealableFromDraft({ name: 'x', ttlHours: 8, snapshot: {}, tags: [] }, NOW)
    expect(out.createdAt).toBe(NOW)
    expect(out.expiresAt).toBe(NOW + 8 * HOUR)
  })

  it('gives a no-expiry draft the ceiling', () => {
    const out = sealableFromDraft({ name: 'x', ttlHours: null, snapshot: {} }, NOW)
    expect(out.expiresAt).toBe(NOW + MAX_KEEP_HOURS * HOUR)
  })

  it('strips "imported" here too', () => {
    const out = sealableFromDraft({ name: 'x', ttlHours: 1, snapshot: {}, tags: ['imported', 'a'] }, NOW)
    expect(out.tags).toEqual(['a'])
  })
})
