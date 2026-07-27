// Registers a Monaco language for Jira / Confluence wiki markup so a snippet in
// that syntax highlights instead of rendering flat, and so the 'jira' language
// id (from utils/detectLanguage.js) is a real, recognised language. Like the
// Mermaid grammar this is a pragmatic Monarch tokenizer, not a full parser: it
// colours the marks a reader scans for — headings, emphasis runs, list bullets,
// {code}/{macro} braces, and [links] — and lets the active vs / vs-dark theme
// map the token types to colours, so it tracks the app's light/dark switch.
export function registerJiraLanguage(monaco) {
  if (monaco.languages.getLanguages().some((l) => l.id === 'jira')) return
  monaco.languages.register({ id: 'jira' })

  monaco.languages.setLanguageConfiguration('jira', {
    brackets: [
      ['[', ']'],
      ['{', '}']
    ],
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '{{', close: '}}' }
    ]
  })

  monaco.languages.setMonarchTokensProvider('jira', {
    defaultToken: '',
    tokenizer: {
      root: [
        // Headings and the block-quote prefix at line start.
        [/^\s*h[1-6]\.\s/, 'keyword'],
        [/^\s*bq\.\s/, 'keyword'],
        // List markers (one or more #/*/- for nesting) at line start.
        [/^\s*[#*-]+\s/, 'type'],
        // {code}, {quote}, {panel}, … macros and {{monospace}}.
        [/\{\{/, 'string', '@monospace'],
        [/\{[^}]*\}/, 'annotation'],
        // [text|url] links.
        [/\[[^\]]*\]/, 'string.link'],
        // *bold*, _italic_, +underline+, -strike- emphasis runs — kept tight
        // (no inner whitespace-only) so ordinary punctuation doesn't light up.
        [/\*[^*\n]+\*/, 'strong'],
        [/(^|\s)_[^_\n]+_/, 'emphasis'],
        [/(^|\s)\+[^+\n]+\+/, 'emphasis'],
        [/(^|\s)-[^-\n]+-/, 'emphasis']
      ],
      monospace: [
        [/}}/, 'string', '@pop'],
        [/[^}]+/, 'string'],
        [/}/, 'string']
      ]
    }
  })
}
