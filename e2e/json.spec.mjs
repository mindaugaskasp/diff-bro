import { test, expect, openMenu, stubOpenDialog } from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The JSON tool is a rich panel (ToolJson): Pretty/Minify/Sort, a JSONPath-subset
// filter, and a syntax-colored collapsible tree. A launch proves the wiring, the
// reactivity, and the clipboard write.
const SRC =
  '{"id":1,"name":"Ada","items":[{"id":10,"name":"alpha"},{"id":20,"name":"beta"}],"log":"{\\"x\\":1}"}'

test('formats, filters via JSONPath, minifies and copies', async ({ app, page }) => {
  await openMenu(page, 'Tools', 'JSON')
  const dlg = page.getByRole('dialog', { name: 'JSON' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('JSON', { exact: true }).fill(SRC)

  await expect(dlg.locator('.tjs-text')).toContainText('"name": "Ada"')
  await expect(dlg.locator('.jt-key').first()).toBeVisible() // tree rendered

  await dlg.getByLabel('JSONPath filter').fill('$.items[*].name')
  await expect(dlg.locator('.tjs-count')).toContainText('2 matches')
  await expect(dlg.locator('.tjs-text')).toContainText('alpha')
  await expect(dlg.locator('.tjs-text')).toContainText('beta')

  await dlg.getByLabel('JSONPath filter').fill('')
  await dlg.locator('.seg-opt', { hasText: 'Minify' }).click()
  await expect(dlg.locator('.tjs-text')).toContainText('{"id":1,"name":"Ada"')
  await dlg.locator('.tjs-copy').click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toContain('{"id":1,')
})

test('reports invalid JSON', async ({ page }) => {
  await openMenu(page, 'Tools', 'JSON')
  const dlg = page.getByRole('dialog', { name: 'JSON' })
  await dlg.getByLabel('JSON', { exact: true }).fill('{ bad: }')
  await expect(dlg.locator('.tjs-err')).toBeVisible()
})

// Structure-aware comparison: the two documents are compared as data, so key
// order and formatting stop counting and a change is reported where it happened.
const jsonFiles = (leftText, rightText) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-struct-'))
  const left = join(dir, 'left.json')
  const right = join(dir, 'right.json')
  writeFileSync(left, leftText)
  writeFileSync(right, rightText)
  return { dir, left, right }
}

async function loadPair(app, page, left, right) {
  await stubOpenDialog(app, left)
  await page.locator('.slot[data-side="left"]').click()
  await stubOpenDialog(app, right)
  await page.locator('.slot[data-side="right"]').click()
  await expect(page.locator('.diff-container, .structure-diff').first()).toBeVisible()
}

test('reordered keys are a text diff but not a structural one', async ({ app, page }) => {
  const { dir, left, right } = jsonFiles(
    '{\n  "a": 1,\n  "b": 2\n}\n',
    '{\n  "b": 2,\n  "a": 1\n}\n'
  )
  try {
    await loadPair(app, page, left, right)

    // As text, the two files differ line for line.
    await expect(page.locator('.monaco-diff-editor')).toBeVisible()

    const structure = page.getByRole('checkbox', { name: 'Structure' })
    await expect(structure).toBeVisible()
    await structure.check()

    await expect(page.locator('.structure-diff')).toBeVisible()
    await expect(page.getByText(/the same data/)).toBeVisible()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a structural change is reported on its own key, with both values', async ({ app, page }) => {
  const { dir, left, right } = jsonFiles(
    '{"db":{"host":"a","port":5432},"gone":1}',
    '{"db":{"port":5432,"host":"b"},"fresh":2}'
  )
  try {
    await loadPair(app, page, left, right)
    await page.getByRole('checkbox', { name: 'Structure' }).check()

    const changed = page.locator('.sd-row.changed', { hasText: 'host' })
    await expect(changed).toBeVisible()
    await expect(changed).toContainText('"a"')
    await expect(changed).toContainText('"b"')

    await expect(page.locator('.sd-row.removed', { hasText: 'gone' })).toBeVisible()
    await expect(page.locator('.sd-row.added', { hasText: 'fresh' })).toBeVisible()
    // port is unchanged, so it is out of the way until asked for.
    await expect(page.locator('.sd-row', { hasText: 'port' })).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'Show unchanged' }).check()
    await expect(page.locator('.sd-row', { hasText: 'port' })).toHaveCount(1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the structure toggle is not offered when the two sides are not both structured', async ({
  page
}) => {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('just some prose')
  await page.getByPlaceholder('Paste changed text here').fill('some other prose')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Structure' })).toHaveCount(0)
})

// The toolbar's +/− are Monaco's line counts. Switching to the structural view
// unmounts Monaco but left them on screen, so the window showed two different
// change totals for one comparison at the same time.
test('the line counts do not linger over the structural view', async ({ app, page }) => {
  const { dir, left, right } = jsonFiles('{"a":1,"b":2,"c":3}', '{"a":9,"b":2,"c":3}')
  try {
    await loadPair(app, page, left, right)
    // The text diff reports its line counts.
    await expect(page.locator('.toolbar .stats')).toBeVisible()

    await page.getByRole('checkbox', { name: 'Structure' }).check()
    await expect(page.locator('.structure-diff')).toBeVisible()
    // Only the structural totals remain — one comparison, one set of numbers.
    await expect(page.locator('.toolbar .stats')).toHaveCount(0)
    await expect(page.locator('.sd-status')).toContainText('1 changed')

    await page.getByRole('checkbox', { name: 'Structure' }).uncheck()
    await expect(page.locator('.toolbar .stats')).toBeVisible()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The structural view is a flat annotated list, not a table: role="row" with no
// cells is an invalid ARIA structure that a screen reader cannot walk.
test('the structural view exposes a valid accessible structure', async ({ app, page }) => {
  const { dir, left, right } = jsonFiles('{"a":1}', '{"a":2}')
  try {
    await loadPair(app, page, left, right)
    await page.getByRole('checkbox', { name: 'Structure' }).check()
    await expect(page.locator('.structure-diff')).toBeVisible()

    const bad = await page.evaluate(
      () =>
        [...document.querySelectorAll('[role="row"]')].filter(
          (r) => !r.querySelector('[role="cell"], [role="gridcell"], [role="columnheader"]')
        ).length
    )
    expect(bad).toBe(0)
    await expect(page.getByRole('list', { name: /Structural differences/ })).toBeVisible()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The view routes the image export too, so the shutter must still find something
// to photograph with no Monaco behind it.
test('a structural comparison can still be exported as an image', async ({ app, page }) => {
  const { dir, left, right } = jsonFiles('{"a":1}', '{"a":2}')
  try {
    await loadPair(app, page, left, right)
    await page.getByRole('checkbox', { name: 'Structure' }).check()
    await expect(page.locator('.structure-diff')).toBeVisible()

    await page.getByRole('button', { name: /Image/ }).click()
    await expect(page.getByRole('dialog', { name: 'Export as image' })).toBeVisible()
    await expect(page.locator('.notice')).toHaveCount(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// YAML has no delimiters to sniff, so the extension proposes the format and a
// parse confirms it — the rest of the structural path is shared with JSON.
test('two YAML files compare as data, not as re-indented lines', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-yaml-'))
  const left = join(dir, 'values.yaml')
  const right = join(dir, 'values.prod.yml')
  writeFileSync(left, 'replicas: 2\nimage:\n  repo: api\n  tag: v1\n')
  writeFileSync(right, 'image:\n    tag: v2\n    repo: api\nreplicas: 2\n')
  try {
    await loadPair(app, page, left, right)
    const structure = page.getByRole('checkbox', { name: 'Structure' })
    await expect(structure).toBeVisible()
    await structure.check()

    await expect(page.locator('.structure-diff')).toBeVisible()
    // Re-indented and reordered, so only the real change is reported.
    const changed = page.locator('.sd-row.changed', { hasText: 'tag' })
    await expect(changed).toContainText('v1')
    await expect(changed).toContainText('v2')
    await expect(page.locator('.sd-status')).toContainText('1 changed')
    await expect(page.locator('.sd-row', { hasText: 'replicas' })).toHaveCount(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
