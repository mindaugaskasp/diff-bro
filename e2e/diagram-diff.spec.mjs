import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  closeViewMenu,
  openViewMenu,
  setViewOption
} from './fixtures.mjs'
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
    const panel = await openViewMenu(page)
    const toggle = panel.getByRole('checkbox', { name: /^Diagram$/i })
    await expect(toggle).toBeVisible({ timeout: 15000 })
    await toggle.check()

    // Split view is on by default, so the two revisions render side by side —
    // the same toggle that splits a text diff into two panes. It must still be
    // OFFERED here: it is not a Monaco-only option, and hiding it beside a
    // diagram removed the only way back to the stitched layout.
    await expect(panel.getByRole('checkbox', { name: 'Split view' })).toBeVisible()
    await closeViewMenu(page)
    await expect(page.locator('.dg-stage svg')).toHaveCount(2, { timeout: 20000 })
    await expect(page.locator('.dg-pane .dg-ttl').first()).toContainText('before')
    await expect(page.locator('.dg-drift')).toBeVisible()

    // Turning it off gives ONE layout carrying both revisions, which is what
    // stops an unchanged node drifting between two independent renders.
    await setViewOption(page, 'Split view', false)
    await expect(page.locator('.dg-stage svg')).toHaveCount(1, { timeout: 20000 })
    await expect(page.locator('.dg-drift')).toHaveCount(0)
    // The status band counts in words, as the proposal specifies.
    const status = page.locator('.status-band')
    await expect(status).toContainText('Nodes')
    await expect(status).toContainText('added')
    // The change list starts collapsed so the picture gets the width; it is one
    // press away.
    await expect(page.locator('.dg-register')).toHaveCount(0)
    await page.getByRole('button', { name: 'Show the change list' }).click()
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
    await setViewOption(page, /^Diagram$/i)
    await setViewOption(page, 'Split view', false)
    await expect(page.locator('.dg-stage svg')).toHaveCount(1, { timeout: 20000 })

    // Focus is on by default; the count of what it hid is stated, never silent.
    await expect(page.locator('.dg-hidden')).toContainText('unchanged hidden', { timeout: 20000 })
    await setViewOption(page, 'Focus on changes', false)
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
    await setViewOption(page, /^Diagram$/i)
    await expect(page.locator('.dg-stage svg')).not.toHaveCount(0, { timeout: 20000 })
    await setViewOption(page, /^Diagram$/i, false)
    await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.dgv')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(work, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// The change list is a 232px reading rail beside the picture. On a wide diagram
// that is width the diff itself wants, so it collapses — and the point is that
// the stage actually GAINS the room, not merely that the rail disappears.
test('the change list collapses and hands its width to the diagram', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  const work = await openPair(userDataDir)
  try {
    await expect(page.locator('.slot[data-side="right"]')).toContainText('pipeline-v2.mmd', {
      timeout: 15000
    })
    await setViewOption(page, /^Diagram$/i)
    await expect(page.locator('.dg-stage svg').first()).toBeVisible({ timeout: 20000 })

    const stageWidth = async () => (await page.locator('.dg-stage').boundingBox()).width
    // Collapsed by default, so the picture starts with the whole width.
    await expect(page.locator('.dg-register')).toHaveCount(0)
    const full = await stageWidth()

    await page.getByRole('button', { name: 'Show the change list' }).click()
    await expect(page.locator('.dg-register')).toContainText('Enrich')
    const railWidth = (await page.locator('.dg-register').boundingBox()).width
    expect(railWidth).toBeGreaterThan(0)
    // Opening it costs the stage exactly the rail's width — the room is handed
    // over, not overlaid.
    expect(await stageWidth()).toBeLessThan(full - railWidth + 2)

    await page.getByRole('button', { name: 'Hide the change list' }).click()
    await expect(page.locator('.dg-register')).toHaveCount(0)
    expect(Math.abs((await stageWidth()) - full)).toBeLessThanOrEqual(2)
  } finally {
    await app.close()
    rmSync(work, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// Toggling a view must not move the control you just pressed. The Diagram
// checkbox sat BETWEEN two conditional ones — "Ignore whitespace" (text only)
// and "Focus on changes" (diagram only) — so every press swapped a neighbour on
// its left for one on its right and slid it sideways under the cursor.
test('the Diagram toggle keeps its position when pressed', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  const work = await openPair(userDataDir)
  try {
    const panel = await openViewMenu(page)
    // Anchored: an unavailable row carries its REASON in its accessible name, so
    // a loose /Diagram/ also matches "Focus applies to a diagram comparison".
    const toggle = panel.getByRole('checkbox', { name: /^Diagram$/i })
    await expect(toggle).toBeVisible({ timeout: 15000 })

    // Its own box, not the label's: the label text is the same either way.
    const x = async () => Math.round((await toggle.boundingBox()).x)
    const on = await x()

    await toggle.uncheck()
    await expect(panel.getByRole('checkbox', { name: 'Ignore whitespace' })).toBeVisible()
    expect(Math.abs((await x()) - on), 'unchecking must not slide the control').toBeLessThanOrEqual(
      1
    )

    await toggle.check()
    await expect(panel.getByRole('checkbox', { name: 'Focus on changes' })).toBeVisible()
    expect(Math.abs((await x()) - on)).toBeLessThanOrEqual(1)
  } finally {
    await app.close()
    rmSync(work, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
