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

/**
 * Writes the demo pair under the data directory if it is not already there and
 * returns both absolute paths. Never overwrites: once written, an edited demo
 * file is the user's own.
 *
 * @param {string} root data directory — passed in, so this file stays free of
 *   Electron and can be tested against a temp folder
 * @returns {string[]} the two absolute paths
 */
export function ensureDemoFiles(root) {
  const dir = join(root, 'demo')
  mkdirSync(dir, { recursive: true })
  return DEMO_FILES.map(({ name, body }) => {
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
export function demoPayloads(root) {
  return ensureDemoFiles(root).map((path, i) => ({
    name: DEMO_FILES[i].name,
    path,
    content: DEMO_FILES[i].body
  }))
}
