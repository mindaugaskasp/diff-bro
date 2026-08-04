import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
const ELECTRON = createRequire(import.meta.url)('electron')

// Only a launched app renders Mermaid: the layout comes from dagre inside the
// real bundle, and the union source has to survive being parsed again. jsdom
// has neither.

const BEFORE = `flowchart TD
  Ingest[Ingest] --> Validate{Valid?}
  Validate -- yes --> Transform[Transform]
  Validate -- no --> Reject[Reject]
  Transform --> Publish[Publish]`

const AFTER = `flowchart TD
  Ingest[Ingest] --> Validate{Valid?}
  Validate -- yes --> Enrich[Enrich]
  Enrich --> Transform[Transform]
  Validate -- no --> Quarantine[Quarantine]
  Transform --> Publish[Publish]`

// Through the real CLI, not a synthetic cli:command: main vouches for a path
// with allowCliPath before file:read will serve it, so a forged message loads
// nothing at all.
function openPair(userDataDir) {
  const work = mkdtempSync(join(tmpdir(), 'diffbro-mmd-'))
  const a = join(work, 'pipeline-v1.mmd')
  const b = join(work, 'pipeline-v2.mmd')
  writeFileSync(a, BEFORE)
  writeFileSync(b, AFTER)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(ELECTRON, [MAIN, `--user-data-dir=${userDataDir}`, 'compare', a, b], {
      env,
      stdio: 'ignore'
    })
    p.on('exit', () => resolve(work))
    setTimeout(() => resolve(work), 8000)
  })
}

test('two Mermaid files offer a Diagram view that renders one stitched picture', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  const work = await openPair(userDataDir)
  try {
    await expect(page.locator('.slot[data-side="right"]')).toContainText('pipeline-v2.mmd', {
      timeout: 15000
    })
    // The toggle renames itself rather than adding a second control.
    const toggle = page.getByRole('checkbox', { name: /Diagram/i })
    await expect(toggle).toBeVisible({ timeout: 15000 })
    await toggle.check()

    // Split view is on by default, so the two revisions render side by side —
    // the same toggle that splits a text diff into two panes. It must still be
    // OFFERED here: it is not a Monaco-only option, and hiding it beside a
    // diagram removed the only way back to the stitched layout.
    await expect(page.getByRole('checkbox', { name: 'Split view' })).toBeVisible()
    await expect(page.locator('.dg-stage svg')).toHaveCount(2, { timeout: 20000 })
    await expect(page.locator('.dg-pane .dg-ttl').first()).toContainText('before')
    await expect(page.locator('.dg-drift')).toBeVisible()

    // Turning it off gives ONE layout carrying both revisions, which is what
    // stops an unchanged node drifting between two independent renders.
    await page.getByRole('checkbox', { name: 'Split view' }).uncheck()
    await expect(page.locator('.dg-stage svg')).toHaveCount(1, { timeout: 20000 })
    await expect(page.locator('.dg-drift')).toHaveCount(0)
    // The status band counts in words, as the proposal specifies.
    const status = page.locator('.status-band')
    await expect(status).toContainText('Nodes')
    await expect(status).toContainText('added')
    // Enrich and Quarantine arrived; Reject went.
    await expect(page.locator('.dg-register')).toContainText('Enrich')
    await expect(page.locator('.dg-register')).toContainText('Reject')
    // The rail groups nodes from edges, as the design proposal specifies.
    await expect(page.locator('.dg-register .reghead').first()).toContainText('Nodes')
    // The legend carries a glyph per status, not colour alone.
    await expect(page.locator('.dg-legend .lgchip')).toHaveCount(4)
  } finally {
    await app.close()
    rmSync(work, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('focus hides the untouched part and says how much', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  const work = await openPair(userDataDir)
  try {
    await expect(page.locator('.slot[data-side="right"]')).toContainText('pipeline-v2.mmd', {
      timeout: 15000
    })
    await page.getByRole('checkbox', { name: /Diagram/i }).check()
    await page.getByRole('checkbox', { name: 'Split view' }).uncheck()
    await expect(page.locator('.dg-stage svg')).toHaveCount(1, { timeout: 20000 })

    // Focus is on by default; the count of what it hid is stated, never silent.
    await expect(page.locator('.dg-hidden')).toContainText('unchanged hidden', { timeout: 20000 })
    await page.getByRole('checkbox', { name: 'Focus on changes' }).uncheck()
    await expect(page.locator('.dg-hidden')).toHaveCount(0)
    // Still one picture, still a real diagram.
    await expect(page.locator('.dg-stage svg')).toHaveCount(1)
  } finally {
    await app.close()
    rmSync(work, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('turning the toggle off returns to the text diff', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  const work = await openPair(userDataDir)
  try {
    await expect(page.locator('.slot[data-side="right"]')).toContainText('pipeline-v2.mmd', {
      timeout: 15000
    })
    const toggle = page.getByRole('checkbox', { name: /Diagram/i })
    await toggle.check()
    await expect(page.locator('.dg-stage svg')).not.toHaveCount(0, { timeout: 20000 })
    await toggle.uncheck()
    await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.dgv')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(work, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
