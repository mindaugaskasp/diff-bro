import { test, expect, setViewOption, stubOpenDialog } from './fixtures.mjs'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A lockfile pair only means anything through a real launch: the file is read by
// the main process, recognised by NAME, and routed to a viewer that is neither
// Monaco nor the structure tree.

const lockfile = (entries) =>
  JSON.stringify(
    {
      lockfileVersion: 3,
      name: 'demo',
      packages: {
        '': {
          name: 'demo',
          dependencies: { vue: '^3.4.0' },
          devDependencies: { vitest: '^4.0.0' }
        },
        ...Object.fromEntries(
          entries.map(([name, version, dev]) => [
            `node_modules/${name}`,
            { version, license: 'MIT', ...(dev ? { dev: true } : {}) }
          ])
        )
      }
    },
    null,
    2
  )

const BEFORE = lockfile([
  ['vue', '3.4.21'],
  ['vitest', '4.1.9', true],
  ['@vue/shared', '3.4.21'],
  ['gone', '1.0.0']
])
const AFTER = lockfile([
  ['vue', '3.5.13'],
  ['vitest', '4.1.9', true],
  ['@vue/shared', '3.5.13']
])

function pair(dir) {
  const left = join(dir, 'before')
  const right = join(dir, 'after')
  mkdirSync(left)
  mkdirSync(right)
  writeFileSync(join(left, 'package-lock.json'), BEFORE)
  writeFileSync(join(right, 'package-lock.json'), AFTER)
  return [join(left, 'package-lock.json'), join(right, 'package-lock.json')]
}

async function openPair(app, page, dir) {
  const [l, r] = pair(dir)
  await stubOpenDialog(app, [l])
  await page.locator('.slot[data-side="left"]').click()
  await stubOpenDialog(app, [r])
  await page.locator('.slot[data-side="right"]').click()
}

test('two lockfiles open as dependencies, not as text', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-deps-'))
  try {
    await openPair(app, page, dir)

    // The dependency view took over without being asked: it is what the files
    // are for, the way a Mermaid pair opens as a picture.
    await expect(page.locator('.deps-diff')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(0)

    // What the reader asked for is on screen; what came with it is folded away.
    await expect(page.locator('.deps-row')).toHaveCount(1)
    const row = page.locator('.deps-row').first()
    await expect(row).toContainText('vue')
    await expect(row).toContainText('3.4.21')
    await expect(row).toContainText('3.5.13')
    await expect(row).toContainText('minor')

    const band = page.locator('.status-band')
    await expect(band).toContainText('1 removed')
    await expect(band).toContainText('2 bumped')
    await expect(band).toContainText('Asked for')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the carried packages are one press away, and the text is one toggle away', async ({
  app,
  page
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-deps-fold-'))
  try {
    await openPair(app, page, dir)
    await expect(page.locator('.deps-diff')).toBeVisible({ timeout: 20000 })

    await page.getByTestId('deps-transitive').click()
    // @vue/shared bumped and `gone` went — both carried, neither asked for.
    await expect(page.locator('.deps-row')).toHaveCount(3)
    await expect(page.locator('.deps-row', { hasText: 'gone' })).toBeVisible()

    // The lockfile is still a file: the toggle gives its text back. Through the
    // fixture helper, because the toolbar folds View into the overflow at a
    // narrow window and hand-rolling the click missed it there.
    await setViewOption(page, 'Dependencies', false)
    await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.deps-diff')).toHaveCount(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
