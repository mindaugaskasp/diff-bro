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
    return {
      kind: 'text',
      text: file.content,
      language: EXT_TO_LANGUAGE[ext] ?? 'plaintext'
    }
  }
}
