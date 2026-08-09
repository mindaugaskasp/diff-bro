// The syntaxes a snippet can be given, read by the editor's picker and by the
// `create snippet` prompt. One table because two drifted: php never reached the
// prompt, so typing it there fell back to auto in silence.
//
// Every option carries a key, including the ones whose English is a proper noun
// ("Python", "Go"), so nobody has to decide per row whether a name is
// translatable and a locale that DOES localise a format name can.
export const SNIPPET_LANGUAGES = [
  { id: 'auto', labelKey: 'language.auto' },
  { id: 'plaintext', labelKey: 'language.plaintext' },
  { id: 'claude', labelKey: 'language.claude' },
  { id: 'url', labelKey: 'language.url' },
  { id: 'mermaid', labelKey: 'language.mermaid' },
  { id: 'json', labelKey: 'language.json' },
  { id: 'sql', labelKey: 'language.sql' },
  { id: 'markdown', labelKey: 'language.markdown' },
  { id: 'jira', labelKey: 'language.jira' },
  { id: 'yaml', labelKey: 'language.yaml' },
  { id: 'python', labelKey: 'language.python' },
  { id: 'shell', labelKey: 'language.shell' },
  { id: 'php', labelKey: 'language.php' },
  { id: 'javascript', labelKey: 'language.javascript' },
  { id: 'typescript', labelKey: 'language.typescript' },
  { id: 'xml', labelKey: 'language.xml' },
  { id: 'html', labelKey: 'language.html' },
  { id: 'css', labelKey: 'language.css' },
  { id: 'dockerfile', labelKey: 'language.dockerfile' },
  { id: 'go', labelKey: 'language.go' },
  { id: 'rust', labelKey: 'language.rust' },
  { id: 'java', labelKey: 'language.java' }
]

// 'auto' is the request to detect, not a syntax to offer.
export const EXPLICIT_LANGUAGES = SNIPPET_LANGUAGES.map((l) => l.id).filter((id) => id !== 'auto')
