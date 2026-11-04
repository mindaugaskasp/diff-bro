import { describe, expect, it } from 'vitest'
import { demoPayloads } from '../../src/main/demoContent'

describe('the core tour’s sample pair', () => {
  it('is the two config files the start screen names', () => {
    expect(demoPayloads().map((p) => p.name)).toEqual(['config-v1.json', 'config-v2.json'])
  })

  it('is valid JSON on both sides, and the two differ', () => {
    const [left, right] = demoPayloads().map((p) => JSON.parse(p.content))
    expect(left.version).not.toBe(right.version)
    expect(Object.keys(right)).toContain('experimental')
  })

  it('carries contents and never a path', () => {
    for (const p of demoPayloads()) {
      expect(p.path).toBeNull()
      expect(p.content).toBeTruthy()
    }
  })

  it('hands out copies, so a caller cannot change the shipped pair', () => {
    demoPayloads()[0].content = 'changed'
    expect(demoPayloads()[0].content).not.toBe('changed')
  })
})
