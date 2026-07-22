import { describe, expect, it } from 'vitest'
import {
  looksLikeMermaid,
  mermaidThemeFor,
  nextDiagramId,
  stripMermaidFence
} from '../../../src/renderer/src/utils/mermaid'
import { detectSnippetLanguage } from '../../../src/renderer/src/utils/detectLanguage'

describe('looksLikeMermaid', () => {
  it('recognizes common diagram openings', () => {
    expect(looksLikeMermaid('flowchart TD\n  A --> B')).toBe(true)
    expect(looksLikeMermaid('sequenceDiagram\n  A->>B: hi')).toBe(true)
    expect(looksLikeMermaid('stateDiagram-v2\n  [*] --> S')).toBe(true)
    expect(looksLikeMermaid('gantt\n  title Plan')).toBe(true)
    expect(looksLikeMermaid('architecture-beta\n  group a')).toBe(true)
  })

  it('skips frontmatter and %% directives before the first real line', () => {
    expect(looksLikeMermaid('---\ntitle: X\n---\nflowchart LR\n A-->B')).toBe(true)
    expect(looksLikeMermaid('%%{init: {"theme":"dark"}}%%\ngraph TD\n A-->B')).toBe(true)
  })

  it('rejects prose and lookalikes', () => {
    expect(looksLikeMermaid('')).toBe(false)
    expect(looksLikeMermaid('just some notes about a flowchart')).toBe(false)
    expect(looksLikeMermaid('# Heading\nsome markdown')).toBe(false)
    // A keyword must start the line, not merely appear in it.
    expect(looksLikeMermaid('the graph shows growth')).toBe(false)
  })
})

describe('stripMermaidFence', () => {
  const code = 'flowchart TD\n    A[Coffee] -->|brews| B{Monday?}'

  it('peels a wrapping ```mermaid fence', () => {
    expect(stripMermaidFence('```mermaid\n' + code + '\n```')).toBe(code)
    expect(stripMermaidFence('```\n' + code + '\n```')).toBe(code)
    expect(stripMermaidFence('\n\n```mermaid\n' + code + '\n```\n\n')).toBe(code)
  })

  it('leaves unfenced and foreign-tagged text alone', () => {
    expect(stripMermaidFence(code)).toBe(code)
    const js = '```js\nconst a = 1\n```'
    expect(stripMermaidFence(js)).toBe(js)
    const unclosed = '```mermaid\n' + code
    expect(stripMermaidFence(unclosed)).toBe(unclosed)
  })

  it('makes fenced diagrams detectable', () => {
    expect(looksLikeMermaid('```mermaid\n' + code + '\n```')).toBe(true)
    expect(detectSnippetLanguage('```mermaid\n' + code + '\n```')).toBe('mermaid')
  })
})

describe('mermaidThemeFor', () => {
  it('pairs the diagram theme to the app theme', () => {
    expect(mermaidThemeFor('light')).toBe('default')
    expect(mermaidThemeFor('dark')).toBe('dark')
    expect(mermaidThemeFor('neon')).toBe('dark') // a dark-ground theme
    expect(mermaidThemeFor(undefined)).toBe('default') // Light is the default ground
  })
})

describe('nextDiagramId', () => {
  it('produces distinct, selector-safe ids', () => {
    const a = nextDiagramId()
    const b = nextDiagramId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^mermaid-\d+$/)
  })
})

describe('detectSnippetLanguage → mermaid', () => {
  it('detects a Mermaid diagram over markdown/plaintext', () => {
    expect(detectSnippetLanguage('sequenceDiagram\n  Alice->>Bob: hi')).toBe('mermaid')
    expect(detectSnippetLanguage('flowchart TD\n  A[x] --> B[y]')).toBe('mermaid')
  })

  it('does not misfire on ordinary text', () => {
    expect(detectSnippetLanguage('hello world')).toBe('plaintext')
  })
})
