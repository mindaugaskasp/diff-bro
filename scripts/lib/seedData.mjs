// Realistic demo data for the screenshot flow: a full snippet library and a mix
// of saved/imported diffs. Shapes mirror the two Pinia stores' persisted form
// (snippetStore / vaultStore) so the seed can be written straight to the store
// files after encrypting each body through window.api.vaultEncrypt.

const HOUR = 3600_000
const DAY = 24 * HOUR

// One entry per SNIPPET_LANGUAGES type worth showing, most-recent first.
export const SNIPPETS = [
  {
    name: 'Service architecture',
    language: 'mermaid',
    tags: ['design'],
    favorite: true,
    content: `flowchart LR
  Client -->|HTTPS| Gateway
  Gateway --> Auth[Auth service]
  Gateway --> Diff[Diff engine]
  Diff --> Vault[(Encrypted vault)]
  Auth --> Vault`
  },
  {
    name: 'Feature flags',
    language: 'json',
    tags: ['config', 'frontend'],
    content: `{
  "flags": {
    "quickLookUp": true,
    "dailyThemeRotation": false,
    "spreadsheetDiff": true
  },
  "rollout": { "percent": 25 }
}`
  },
  {
    name: 'Release notes 3.5',
    language: 'jira',
    tags: ['release'],
    content: `h2. Diff Bro 3.5

* *Quick look-up* — summon a floating search with a global shortcut
* Nine themes, including a Matrix rain theme
{code:bash}brew upgrade --cask diff-bro{code}
Thanks to everyone who [reported issues|https://example.com].`
  },
  {
    name: 'Invoice total',
    language: 'php',
    tags: ['backend'],
    content: `<?php
function invoiceTotal(array $lines): float
{
    return array_reduce($lines, fn ($sum, $l) => $sum + $l['qty'] * $l['price'], 0.0);
}`
  },
  {
    name: 'Active users query',
    language: 'sql',
    tags: ['db', 'analytics'],
    content: `SELECT region, COUNT(*) AS users
FROM sessions
WHERE last_seen > now() - interval '30 days'
GROUP BY region
ORDER BY users DESC;`
  },
  {
    name: 'Deployment',
    language: 'yaml',
    tags: ['k8s', 'infra'],
    content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: diff-engine
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: engine
          image: diff-engine:3.5`
  },
  {
    name: 'Backfill script',
    language: 'python',
    tags: ['backend', 'db'],
    content: `import sys

def backfill(rows):
    for row in rows:
        row["migrated"] = True
        yield row

if __name__ == "__main__":
    print(f"backfilling {sys.argv[1]}")`
  },
  {
    name: 'Debounce helper',
    language: 'javascript',
    tags: ['frontend'],
    content: `export function debounce(fn, ms) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}`
  },
  {
    name: 'Diff result type',
    language: 'typescript',
    tags: ['frontend'],
    content: `export interface DiffResult {
  additions: number
  deletions: number
  identical: boolean
  sides: [left: string, right: string]
}`
  },
  {
    name: 'Release script',
    language: 'shell',
    tags: ['infra', 'release'],
    content: `#!/usr/bin/env bash
set -euo pipefail
npm run check
npm run build
git tag "v$1" && git push --tags`
  },
  {
    name: 'Maven dependency',
    language: 'xml',
    tags: ['backend'],
    content: `<dependency>
  <groupId>com.example</groupId>
  <artifactId>diff-core</artifactId>
  <version>3.5.0</version>
</dependency>`
  },
  {
    name: 'Contributing notes',
    language: 'markdown',
    tags: ['docs'],
    content: `## Contributing

1. \`npm run check\` must pass
2. Keep components under 250 lines
3. New UI is verified in **both** themes`
  },
  {
    name: 'Health handler',
    language: 'go',
    tags: ['backend'],
    content: `func Health(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    w.Write([]byte(\`{"status":"ok"}\`))
}`
  },
  {
    name: 'Checksum',
    language: 'rust',
    tags: ['backend'],
    content: `fn checksum(bytes: &[u8]) -> u32 {
    bytes.iter().fold(0u32, |acc, b| acc.wrapping_add(*b as u32))
}`
  },
  {
    name: 'App image',
    language: 'dockerfile',
    tags: ['infra'],
    content: `FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm ci && npm run build
CMD ["npm", "start"]`
  }
]

const jsonPair = (a, b) => ({
  mode: 'files',
  renderSideBySide: true,
  ignoreTrimWhitespace: false,
  left: { path: null, name: a.name, content: a.content },
  right: { path: null, name: b.name, content: b.content }
})

// Saved (own) diffs — from: null. A mix of json / xml / text / excel so the
// sidebar shows the range of format tags.
export function savedDiffs(now) {
  return [
    {
      name: 'Staging vs prod config',
      tags: ['json', 'config'],
      favorite: true,
      createdAt: now - 2 * HOUR,
      expiresAt: null,
      from: null,
      payload: jsonPair(
        { name: 'staging.json', content: '{\n  "replicas": 2,\n  "debug": true\n}' },
        { name: 'prod.json', content: '{\n  "replicas": 6,\n  "debug": false\n}' }
      )
    },
    {
      name: 'pom.xml dependency bump',
      tags: ['xml', 'backend'],
      createdAt: now - 5 * HOUR,
      expiresAt: now + 20 * HOUR,
      from: null,
      payload: jsonPair(
        { name: 'pom-before.xml', content: '<version>3.4.0</version>' },
        { name: 'pom-after.xml', content: '<version>3.5.0</version>' }
      )
    },
    {
      name: 'Release notes 3.4 → 3.5',
      tags: ['release'],
      createdAt: now - 26 * HOUR,
      expiresAt: null,
      from: null,
      payload: jsonPair(
        { name: 'notes-3.4.txt', content: 'Bug fixes and polish.' },
        { name: 'notes-3.5.txt', content: 'Quick look-up, nine themes, spreadsheet diff.' }
      )
    },
    {
      name: 'Q3 budget workbook',
      tags: ['excel', 'finance'],
      createdAt: now - 3 * DAY,
      expiresAt: null,
      from: null,
      payload: jsonPair(
        { name: 'budget-2024.xlsx', content: '(spreadsheet)' },
        { name: 'budget-2025.xlsx', content: '(spreadsheet)' }
      )
    }
  ]
}

// Imported/external diffs — from: <sender>. The store auto-tags these "imported".
export function externalDiffs(now) {
  return [
    {
      name: 'Prod config drift',
      tags: ['json', 'imported', 'infra'],
      createdAt: now - 40 * 60_000,
      expiresAt: now + 7 * HOUR,
      from: 'Alice — MacBook',
      payload: jsonPair(
        { name: 'expected.json', content: '{\n  "timeout": 30\n}' },
        { name: 'actual.json', content: '{\n  "timeout": 5\n}' }
      )
    },
    {
      name: 'Feature flags review',
      tags: ['json', 'imported'],
      favorite: true,
      createdAt: now - 90 * 60_000,
      expiresAt: now + 22 * HOUR,
      from: 'Bob — workstation',
      payload: jsonPair(
        { name: 'flags-main.json', content: '{\n  "beta": false\n}' },
        { name: 'flags-branch.json', content: '{\n  "beta": true\n}' }
      )
    },
    {
      name: 'API schema v2 vs v3',
      tags: ['json', 'imported', 'api'],
      createdAt: now - 6 * HOUR,
      expiresAt: now + 12 * HOUR,
      from: 'Carol — laptop',
      payload: jsonPair(
        { name: 'schema-v2.json', content: '{\n  "id": "int"\n}' },
        { name: 'schema-v3.json', content: '{\n  "id": "uuid"\n}' }
      )
    }
  ]
}
