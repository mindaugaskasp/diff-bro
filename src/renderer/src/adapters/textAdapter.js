import { detectSnippetLanguage } from '../utils/detectLanguage'

// Content detection is capped to a prefix: the signals it looks for sit near the
// top of a file, and running the JSON validator across a multi-MB paste would
// cost far more than the syntax coloring is worth.
const DETECT_LIMIT = 50_000

const EXT_TO_LANGUAGE = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  jsx: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  vue: 'html',
  md: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  sh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  sql: 'sql',
  ini: 'ini',
  toml: 'ini'
}

export const textAdapter = {
  id: 'text',
  // Fallback adapter: matches everything.
  matches: () => true,
  toComparable(file) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    // A known extension is authoritative. Otherwise — an extensionless file
    // (Dockerfile, Makefile, a shell script named `deploy`) or pasted text,
    // whose synthetic name carries no real extension — sniff the content so the
    // diff is still highlighted rather than dumped as plaintext.
    const language =
      EXT_TO_LANGUAGE[ext] ?? detectSnippetLanguage(file.content?.slice(0, DETECT_LIMIT) ?? '')
    return { kind: 'text', text: file.content, language }
  }
}
