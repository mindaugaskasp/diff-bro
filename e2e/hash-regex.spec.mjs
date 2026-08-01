import { test, expect, openMenu } from './fixtures.mjs'

// The checksum tool computes NOTHING in the renderer — every digest comes back
// over IPC from node:crypto (SubtleCrypto has no MD5 or SHA-1, and a file is
// streamed in main so its size stops mattering). That round-trip only exists in
// a launched app. The regex tester is pure, but its highlighting is rendered
// from segments rather than markup, which is a layout fact jsdom can't answer.

const FOX = 'The quick brown fox jumps over the lazy dog'
const FOX_SHA256 = 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'

const openTool = (page, label) => openMenu(page, 'Tools', label)

test('the checksum tool digests text through main and names a pasted match', async ({ page }) => {
  await openTool(page, 'Checksum / Hash')
  const dialog = page.getByRole('dialog', { name: 'Checksum' })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Text to hash').fill(FOX)

  // Published vectors, so this proves the real algorithms ran — not that the
  // app agrees with itself.
  await expect(dialog.locator('.th-row', { hasText: 'SHA-256' })).toContainText(FOX_SHA256)
  await expect(dialog.locator('.th-row', { hasText: 'MD5' })).toContainText(
    '9e107d9d372bb6826bd81d3542a419d6'
  )

  // The compare field is what a checksum tool is for: it names which one it is.
  await dialog.getByLabel('Expected digest').fill(FOX_SHA256.toUpperCase())
  await expect(dialog.locator('.th-verdict')).toHaveText(/matches SHA-256/)
  await expect(dialog.locator('.th-row.hit')).toContainText('SHA-256')

  await dialog.getByLabel('Expected digest').fill('deadbeef')
  await expect(dialog.locator('.th-verdict')).toHaveText(/no match/)
  await expect(dialog.locator('.th-row.hit')).toHaveCount(0)
})

test('the regex tester highlights matches without building markup', async ({ page }) => {
  await openTool(page, 'Regex Tester')
  const dialog = page.getByRole('dialog', { name: 'Regex' })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Regular expression').fill('\\d+')
  await dialog.getByLabel('Subject text').fill('a1 b22 c333')

  await expect(dialog.locator('.tre-bh')).toContainText('3 matches')
  await expect(dialog.locator('.tre-out .hit')).toHaveText(['1', '22', '333'])
  // The subject on screen is still exactly what was typed — the segments
  // rebuild it, they don't rewrite it.
  await expect(dialog.locator('.tre-out')).toHaveText('a1 b22 c333')
})

// A subject that happens to contain markup must render as text. This is the
// rule-8 guarantee, and the only place it can actually be observed.
test('a subject containing HTML renders as text, never as elements', async ({ page }) => {
  await openTool(page, 'Regex Tester')
  const dialog = page.getByRole('dialog', { name: 'Regex' })
  await dialog.getByLabel('Regular expression').fill('script')
  await dialog.getByLabel('Subject text').fill('<script>alert(1)</script>')

  await expect(dialog.locator('.tre-out')).toHaveText('<script>alert(1)</script>')
  await expect(dialog.locator('.tre-out script')).toHaveCount(0)
})

test('an invalid pattern is reported, and the subject survives it', async ({ page }) => {
  await openTool(page, 'Regex Tester')
  const dialog = page.getByRole('dialog', { name: 'Regex' })
  await dialog.getByLabel('Subject text').fill('keep me')
  await dialog.getByLabel('Regular expression').fill('(unclosed')

  await expect(dialog.locator('.tre-err')).toBeVisible()
  await expect(dialog.getByLabel('Subject text')).toHaveValue('keep me')
})

test('flags are chips, so an invalid flag cannot be typed', async ({ page }) => {
  await openTool(page, 'Regex Tester')
  const dialog = page.getByRole('dialog', { name: 'Regex' })
  await dialog.getByLabel('Regular expression').fill('ABC')
  await dialog.getByLabel('Subject text').fill('abc')
  await expect(dialog.locator('.tre-bh')).toContainText('0 matches')

  await dialog.getByRole('button', { name: 'i', exact: true }).click()
  await expect(dialog.locator('.tre-bh')).toContainText('1 match')
})
