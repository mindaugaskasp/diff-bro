import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Two files the tour's first step opens, so it teaches the real open/drop route
// rather than pointing at empty boxes. Shipped as content and written to disk
// once: main computes the paths, the renderer never names a file to write.
export const DEMO_FILES = [
  {
    name: 'demo-config-v1.json',
    body: `{
  "name": "diffbro-demo",
  "version": "1.0.0",
  "settings": {
    "fontSize": 13,
    "autoSave": false,
    "telemetry": true
  },
  "plugins": ["linter"]
}
`
  },
  {
    name: 'demo-config-v2.json',
    body: `{
  "name": "diffbro-demo",
  "version": "2.0.0",
  "settings": {
    "fontSize": 14,
    "autoSave": true
  },
  "plugins": ["linter", "spellcheck"],
  "experimental": {
    "fastDiff": true
  }
}
`
  }
]

// A second pair, so the tour's diagram step can show a diagram CHANGE rather
// than describe one. Small on purpose: it has to render inside the beat the
// step holds the veil down for.
export const DIAGRAM_FILES = [
  {
    name: 'demo-flow-v1.mmd',
    body: `flowchart TD
  A[Request] --> B{Cached?}
  B -- yes --> C[Serve from cache]
  B -- no --> D[Query database]
  D --> E[Return response]
  C --> E
`
  },
  {
    name: 'demo-flow-v2.mmd',
    body: `flowchart TD
  A[Request] --> B{Cached?}
  B -- yes --> C[Serve from cache]
  B -- no --> D[Query database]
  D --> F[Write to cache]
  F --> E[Return response]
  C --> E
`
  }
]

/** Named sets, so the renderer asks for a KIND and never for a file. */
const setFor = (kind) => (kind === 'diagram' ? DIAGRAM_FILES : DEMO_FILES)

/**
 * Writes a demo pair under the data directory if it is not already there and
 * returns both absolute paths. Never overwrites: once written, an edited demo
 * file is the user's own.
 *
 * @param {string} root data directory — passed in, so this file stays free of
 *   Electron and can be tested against a temp folder
 * @param {'config'|'diagram'} [kind]
 * @returns {string[]} the two absolute paths
 */
export function ensureDemoFiles(root, kind) {
  const dir = join(root, 'demo')
  mkdirSync(dir, { recursive: true })
  return setFor(kind).map(({ name, body }) => {
    const path = join(dir, name)
    if (!existsSync(path)) writeFileSync(path, body, 'utf8')
    return path
  })
}

/**
 * The pair as the renderer consumes it — CONTENTS, not paths. `file:read`
 * refuses anything under userData on purpose (a raw path arg would be
 * an arbitrary-file-read primitive in a compromised renderer), and that guard is
 * not one to weaken for a demo. Main owns these files, so main hands over what
 * it already knows.
 *
 * @returns {{ name: string, path: string, content: string }[]}
 */
export function demoPayloads(root, kind) {
  const files = setFor(kind)
  return ensureDemoFiles(root, kind).map((path, i) => ({
    name: files[i].name,
    path,
    content: files[i].body
  }))
}
