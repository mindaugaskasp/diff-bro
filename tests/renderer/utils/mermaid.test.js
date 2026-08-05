import { describe, expect, it } from 'vitest'
import {
  diagramPaperFor,
  effectiveDiagramMode,
  looksLikeMermaid,
  mermaidThemeFor,
  nextDiagramId,
  repairMermaid,
  stripMermaidFence
} from '../../../src/renderer/src/utils/mermaid'
import { detectSnippetLanguage } from '../../../src/renderer/src/utils/detectLanguage'
import { THEMES } from '../../../src/renderer/src/utils/themes'

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
  it('names the Mermaid theme for a resolved mode', () => {
    expect(mermaidThemeFor('light')).toBe('default')
    expect(mermaidThemeFor('dark')).toBe('dark')
    expect(mermaidThemeFor(undefined)).toBe('default') // light is the default ground
  })
})

describe('effectiveDiagramMode', () => {
  // A literal table, not `isDarkTheme(t.id) ? 'dark' : 'light'` — that IS the
  // implementation, so the old loop could never fail for any theme. A
  // mis-classified theme has to fail here, where the rendering consequence is.
  const GROUNDS = [
    ['light', 'light'],
    ['dark', 'dark'],
    ['solar', 'light'],
    ['neon', 'dark'],
    ['nord', 'dark'],
    ['sepia', 'light'],
    ['dim', 'dark'],
    ['beacon', 'dark'],
    ['meridian', 'light'],
    ['linen', 'light'],
    ['bloom', 'light'],
    ['nyan', 'dark'],
    ['matrix', 'dark'],
    ['contrast', 'light']
  ]

  it('follows the app theme on auto, for every theme', () => {
    for (const [theme, mode] of GROUNDS) {
      expect(effectiveDiagramMode(theme, 'auto'), theme).toBe(mode)
    }
  })

  it('covers every theme that ships', () => {
    expect(GROUNDS.map(([t]) => t).sort()).toEqual(THEMES.map((t) => t.id).sort())
  })

  it('lets an explicit choice win over the app theme', () => {
    expect(effectiveDiagramMode('dark', 'light')).toBe('light')
    expect(effectiveDiagramMode('light', 'dark')).toBe('dark')
    expect(effectiveDiagramMode('matrix', 'light')).toBe('light')
  })

  // A hand-edited settings file is the only way this happens, and it must read
  // as "follow the app" rather than freezing the diagram in one mode.
  it('treats a missing or unknown preference as auto', () => {
    expect(effectiveDiagramMode('dark', undefined)).toBe('dark')
    expect(effectiveDiagramMode('dark', 'sepia')).toBe('dark')
    expect(effectiveDiagramMode('sepia', '')).toBe('light')
  })
})

describe('diagramPaperFor', () => {
  // The default must not re-ground a single theme: with auto, the diagram keeps
  // sitting on --bg, which is what Mermaid's two themes are tuned against.
  it('asks for no paper of its own while the mode agrees with the app', () => {
    for (const t of THEMES) expect(diagramPaperFor(t.id, 'auto')).toBe('')
    expect(diagramPaperFor('dark', 'dark')).toBe('')
    expect(diagramPaperFor('sepia', 'light')).toBe('')
  })

  // Mermaid's light theme draws dark text; on a dark --bg that is unreadable, so
  // an overridden diagram brings its own ground.
  it('names the paper when the diagram disagrees with the app ground', () => {
    expect(diagramPaperFor('dark', 'light')).toBe('light')
    expect(diagramPaperFor('matrix', 'light')).toBe('light')
    expect(diagramPaperFor('light', 'dark')).toBe('dark')
    expect(diagramPaperFor('sepia', 'dark')).toBe('dark')
  })
})

// Everything here is damage a COPY did, not a diagram someone wrote wrong: the
// characters are invisible in an editor, so the error Mermaid reports names a
// token rather than the glyph that caused it. Written as escapes on purpose —
// the literals are indistinguishable from the characters they replace.
describe('repairMermaid', () => {
  const EM = '—' // — what Word makes of "--"
  const EN = '–' // –
  const NBSP = ' '
  const NARROW = ' '
  const ZWSP = '​'
  const BOM = '﻿'

  it('puts back arrows that autocorrect ate', () => {
    expect(repairMermaid(`flowchart TD\n  A ${EM}> B`)).toBe('flowchart TD\n  A --> B')
    expect(repairMermaid(`flowchart TD\n  A ${EN}> B`)).toBe('flowchart TD\n  A --> B')
    expect(repairMermaid('flowchart TD\n  A → B')).toBe('flowchart TD\n  A --> B')
    expect(repairMermaid(`flowchart LR\n  A <${EM} B`)).toBe('flowchart LR\n  A <-- B')
  })

  // The case that decides whether this is safe to run on someone's text: a dash
  // inside a label is their writing, not transport damage.
  it('leaves an em dash inside a label alone', () => {
    const kept = `flowchart TD\n  A[Build ${EM} then ship] --> B`
    expect(repairMermaid(kept)).toBe(kept)
  })

  // A non-breaking space looks exactly like a space and is not one.
  it('normalises the spaces rich text brings with it', () => {
    expect(repairMermaid(`flowchart TD\n ${NBSP} A${NARROW}--> B`)).toBe('flowchart TD\n   A --> B')
  })

  // Word replaces the quotes AROUND a label, which is what breaks it.
  it('straightens smart quotes', () => {
    expect(repairMermaid('flowchart TD\n  A[“hi”] --> B')).toBe('flowchart TD\n  A["hi"] --> B')
    expect(repairMermaid('flowchart TD\n  A[‘hi’] --> B')).toBe("flowchart TD\n  A['hi'] --> B")
  })

  it('peels a copied code fence, strips a BOM and zero-width characters', () => {
    expect(repairMermaid('```mermaid\nflowchart TD\n  A --> B\n```')).toBe(
      'flowchart TD\n  A --> B'
    )
    expect(repairMermaid(`${BOM}flowchart TD\n  A${ZWSP} --> B`)).toBe('flowchart TD\n  A --> B')
  })

  it('normalises line endings and trailing whitespace', () => {
    expect(repairMermaid('flowchart TD\r\n  A --> B   \r\n')).toBe('flowchart TD\n  A --> B')
    expect(repairMermaid('\n\nflowchart TD\n  A --> B\n\n\n')).toBe('flowchart TD\n  A --> B')
  })

  it('returns a clean diagram byte-identical, and is idempotent', () => {
    const clean = 'sequenceDiagram\n  Alice->>Bob: hi\n  Bob-->>Alice: hello'
    expect(repairMermaid(clean)).toBe(clean)
    const once = repairMermaid(`flowchart TD\r\n  A ${EM}> B  `)
    expect(repairMermaid(once)).toBe(once)
  })

  it('survives empty and non-string input', () => {
    expect(repairMermaid('')).toBe('')
    expect(repairMermaid(null)).toBe('')
    expect(repairMermaid(undefined)).toBe('')
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
