import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const tokens = readFileSync('src/renderer/src/styles/tokens.css', 'utf8')

describe('tokens.css', () => {
  // A repo-wide sweep of literal font stacks onto var(--font-mono) once caught
  // tokens.css itself, leaving `--font-mono: var(--font-mono)`. That resolves to
  // nothing, so every mono surface silently fell back to the inherited sans —
  // including the two overlay layers, which then no longer shared metrics.
  it('defines --font-mono as a real stack, not as itself', () => {
    const line = tokens.match(/--font-mono:\s*([^;]+);/)
    expect(line).not.toBeNull()
    expect(line[1]).not.toContain('var(--font-mono)')
    expect(line[1]).toMatch(/monospace/)
  })

  it('has no self-referential custom property at all', () => {
    for (const [, name, value] of tokens.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      expect(value, `${name} refers to itself`).not.toContain(`var(${name})`)
    }
  })
})
