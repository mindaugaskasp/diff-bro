// The data `make local-seed` puts into a real install: everything the
// screenshot seed has, plus the awkward shapes a demo library never contains —
// a five-thousand-line diff, one with no differences at all, a brand-new file,
// lines too long to wrap, and expiries on both sides of now.
//
// Every entry carries the `seed` tag. That is what makes `make local-seed-clean`
// exact: it removes what this wrote and nothing else.

import { SNIPPETS, savedDiffs, externalDiffs } from './seedData.mjs'

export const SEED_TAG = 'seed'

const HOUR = 3600_000
const DAY = 24 * HOUR

const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('\n')

const pair = (a, b) => ({
  mode: 'files',
  renderSideBySide: true,
  ignoreTrimWhitespace: false,
  left: { path: null, name: a.name, content: a.content },
  right: { path: null, name: b.name, content: b.content }
})

// ── snippets the screenshot set doesn't cover ────────────────────────────────

export const EXTRA_SNIPPETS = [
  {
    name: 'Nginx reverse proxy',
    language: 'plaintext',
    tags: ['infra', 'nginx'],
    content: `server {
  listen 443 ssl http2;
  server_name diffbro.local;

  location /api/ {
    proxy_pass         http://127.0.0.1:8080/;
    proxy_set_header   Host $host;
    proxy_read_timeout 60s;
  }
}`
  },
  {
    name: 'Recent orders by region',
    language: 'sql',
    tags: ['sql', 'reporting'],
    content: `SELECT r.name AS region, COUNT(*) AS orders, SUM(o.total) AS revenue
FROM orders o
JOIN regions r ON r.id = o.region_id
WHERE o.placed_at >= NOW() - INTERVAL '30 days'
GROUP BY r.name
HAVING COUNT(*) > 10
ORDER BY revenue DESC;`
  },
  {
    name: 'Kubernetes deployment',
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
          image: registry.local/diff-engine:3.5.0
          resources:
            limits: { cpu: "1", memory: 512Mi }`
  },
  {
    name: 'Release checklist',
    language: 'markdown',
    tags: ['release', 'process'],
    content: `## Before tagging

- [ ] \`npm run check\` green
- [ ] \`make e2e\` green
- [ ] CHANGELOG updated
- [ ] Version bumped in \`package.json\``
  },
  {
    name: 'Retry with backoff',
    language: 'typescript',
    tags: ['frontend', 'util'],
    content: `export async function retry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let wait = 200
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, wait))
      wait *= 2
    }
  }
  throw new Error('unreachable')
}`
  },
  {
    name: 'Purge old exports',
    language: 'shell',
    tags: ['ops', 'cron'],
    content: `#!/usr/bin/env bash
set -euo pipefail
find "\${EXPORT_DIR:?}" -maxdepth 1 -name '*.png' -mtime +14 -print -delete`
  },
  {
    name: 'Deploy pipeline',
    language: 'mermaid',
    tags: ['design', 'ci'],
    content: `sequenceDiagram
  Developer->>CI: push tag
  CI->>CI: build + test
  CI->>Registry: publish image
  Registry-->>Cluster: rollout
  Cluster-->>Developer: green`
  },
  {
    name: 'Staging DB password',
    language: 'plaintext',
    tags: ['secret', 'staging'],
    secret: true,
    content: 'pg://diffbro:hunter2-not-really@staging-db.internal:5432/diffbro'
  },
  {
    name: 'Release notes template',
    language: 'markdown',
    tags: ['release', 'template'],
    content: `## {{version}} — {{date}}

**Highlights**
- {{highlight}}

Shipped by {{author}}.`
  },
  {
    name: 'Long single line',
    language: 'plaintext',
    tags: ['edge-case'],
    content: `token=${'x'.repeat(4000)}`
  }
]

// ── diffs the demo library never has ─────────────────────────────────────────

const bigLeft = lines(5000, (i) => `  "key_${String(i).padStart(4, '0')}": "value ${i}",`)
const bigRight = lines(5000, (i) =>
  i % 37 === 0
    ? `  "key_${String(i).padStart(4, '0')}": "CHANGED ${i}",`
    : `  "key_${String(i).padStart(4, '0')}": "value ${i}",`
)

const wide = (marker) => lines(40, (i) => `row ${i}: ${marker}${'-'.repeat(600)}| end`)

const YAML_BEFORE = `service:
  name: diff-engine
  replicas: 3
  limits:
    cpu: "1"
    memory: 512Mi
  features: [structure-view, sealed-share]
`
const YAML_AFTER = `service:
  replicas: 6
  name: diff-engine
  limits:
    memory: 1Gi
    cpu: "2"
  features: [sealed-share, structure-view, streaming]
`

/**
 * @param {number} now
 * @returns {object[]} vault entries, all tagged `seed`
 */
export function sizeRangeDiffs(now) {
  return [
    {
      name: 'Two-line tweak',
      tags: ['small'],
      createdAt: now - 10 * 60_000,
      expiresAt: null,
      from: null,
      payload: pair({ name: 'a.txt', content: 'one\ntwo' }, { name: 'b.txt', content: 'one\nTWO' })
    },
    {
      name: 'Big config — 5000 lines, 136 changes',
      tags: ['json', 'large', 'perf'],
      createdAt: now - HOUR,
      expiresAt: null,
      from: null,
      payload: pair(
        { name: 'huge-before.json', content: bigLeft },
        { name: 'huge-after.json', content: bigRight }
      )
    },
    {
      name: 'Very wide lines',
      tags: ['edge-case'],
      createdAt: now - 2 * HOUR,
      expiresAt: null,
      from: null,
      payload: pair(
        { name: 'wide-a.log', content: wide('A') },
        { name: 'wide-b.log', content: wide('B') }
      )
    },
    {
      name: 'Identical files',
      tags: ['edge-case'],
      createdAt: now - 3 * HOUR,
      expiresAt: null,
      from: null,
      payload: pair(
        { name: 'same-1.txt', content: 'nothing changed here\nat all\n' },
        { name: 'same-2.txt', content: 'nothing changed here\nat all\n' }
      )
    },
    {
      name: 'Brand-new file (nothing on the left)',
      tags: ['edge-case'],
      createdAt: now - 4 * HOUR,
      expiresAt: null,
      from: null,
      payload: pair(
        { name: 'missing.ts', content: '' },
        { name: 'added.ts', content: lines(60, (i) => `export const item${i} = ${i}`) }
      )
    },
    {
      name: 'YAML reordered — structure view',
      tags: ['yaml', 'structure'],
      createdAt: now - 5 * HOUR,
      expiresAt: null,
      from: null,
      payload: pair(
        { name: 'service-before.yaml', content: YAML_BEFORE },
        { name: 'service-after.yaml', content: YAML_AFTER }
      )
    },
    {
      name: 'Expires in ten minutes',
      tags: ['expiry'],
      createdAt: now - 23 * HOUR,
      expiresAt: now + 10 * 60_000,
      from: null,
      payload: pair({ name: 'x.txt', content: 'before' }, { name: 'y.txt', content: 'after' })
    },
    {
      name: 'Already expired',
      tags: ['expiry'],
      createdAt: now - 2 * DAY,
      expiresAt: now - HOUR,
      from: null,
      payload: pair({ name: 'old-a.txt', content: 'stale' }, { name: 'old-b.txt', content: 'gone' })
    },
    {
      name: 'A whole week to live',
      tags: ['expiry'],
      createdAt: now - 30 * 60_000,
      expiresAt: now + 7 * DAY,
      from: null,
      payload: pair({ name: 'week-a.txt', content: 'one' }, { name: 'week-b.txt', content: 'two' })
    },
    {
      name: 'Incident 4412 — log tail',
      tags: ['imported', 'incident'],
      createdAt: now - 20 * 60_000,
      expiresAt: now + 2 * DAY,
      from: 'Dana — on-call laptop',
      payload: pair(
        { name: 'before.log', content: lines(400, (i) => `${i} INFO  request ok`) },
        {
          name: 'after.log',
          content: lines(400, (i) => (i % 11 ? `${i} INFO  request ok` : `${i} ERROR upstream 502`))
        }
      )
    }
  ]
}

const tagged = (entries) => entries.map((e) => ({ ...e, tags: [...(e.tags ?? []), SEED_TAG] }))

/** Every snippet this seed writes, each tagged `seed`. */
export const localSnippets = () => tagged([...SNIPPETS, ...EXTRA_SNIPPETS])

/**
 * Every saved / imported diff this seed writes, each tagged `seed`.
 * @param {number} now
 */
export const localDiffs = (now) =>
  tagged([...savedDiffs(now), ...externalDiffs(now), ...sizeRangeDiffs(now)])
