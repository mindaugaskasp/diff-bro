// What a first-time library holds. Content, not logic — kept out of the store
// so a change to the demo text is never a change to the snippet machinery.
// `nameKey` rather than a name: the seed runs at first launch, in whatever
// locale the app started in.

/** Seeded into an empty library so a first-time user sees a real snippet. */
export const EXAMPLE_SNIPPET = {
  nameKey: 'snippetNotices.exampleMermaidDiagram',
  language: 'mermaid',
  tags: ['example'],
  content: `flowchart TD
    A[New snippet] --> B{Syntax?}
    B -- Mermaid --> C[Live diagram preview]
    B -- Anything else --> D[Syntax-highlighted text]
    C --> E[Expand for a zoomable view]
    C --> F[Encrypted at rest, like every snippet]
    D --> F`
}

/**
 * Seeded alongside the Mermaid example: a Claude prompt showing {{variables}} —
 * copying it asks you to fill them in first (see SnippetFillDialog).
 */
export const CLAUDE_EXAMPLE_SNIPPET = {
  nameKey: 'snippetNotices.exampleClaudeReviewPrompt',
  language: 'claude',
  tags: ['example', 'prompt'],
  content: `Review the {{language}} changes in {{file}} for correctness, edge cases, and {{concern}}.

Reply with a prioritized list — most critical first — and suggest a fix for each.`
}
