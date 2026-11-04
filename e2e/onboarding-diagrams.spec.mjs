import { test, expect, docActions } from './fixtures.mjs'
import { finishCoreTour, expectRinged } from './onboardingTour.mjs'

test.use({ tips: true })

const ORIGINAL = 'Example — Mermaid diagram'
const V2 = 'Example — Mermaid diagram, v2'

const coach = (page) => page.locator('.coach-mark')
const snippetRow = (page, name) =>
  page.locator('.snippets-section .row').filter({
    has: page.locator('.nm', { hasText: new RegExp(`^${name}$`) })
  })
const compareWith = (page) => docActions(page).getByRole('button', { name: 'Compare with…' })
const rightPane = (page) => page.locator('[data-tour="pane-right"]')

async function startFromDoneCard(page) {
  await finishCoreTour(page)
  await page.locator('.tour-done').getByRole('button', { name: 'Diagrams', exact: true }).click()
  await expect(coach(page)).toContainText('Diagrams · 1 of 3')
}

async function openAndCompare(page) {
  await expect(coach(page)).toContainText('Open the example diagram')
  await expectRinged(page, snippetRow(page, ORIGINAL))
  await snippetRow(page, ORIGINAL).locator('.entry').click()

  await expect(coach(page)).toContainText('Diagrams · 2 of 3')
  await expect(coach(page)).toContainText('Compare it with another version')
  await expectRinged(page, compareWith(page))
  await compareWith(page).click()
  await expect(page.locator('.pane-label[data-side="left"]')).toHaveText(ORIGINAL)
}

test('the v2 example is in a fresh library, tagged example', async ({ page }) => {
  await page.locator('.start-surface').waitFor()
  const stored = await page.evaluate(() => JSON.parse(window.api.storeLoad('snippets')).entries)
  const v2 = stored.find((e) => e.name === V2)
  expect(v2.tags).toContain('example')
  expect(v2.language).toBe('mermaid')
})

test('open, Compare with…, drag v2 onto the right: the diagram comparison', async ({ page }) => {
  await startFromDoneCard(page)
  await openAndCompare(page)

  await expect(coach(page)).toContainText('Diagrams · 3 of 3')
  await expect(coach(page)).toContainText('Drop v2 here')
  await expect(coach(page).locator('.cm-name')).toHaveText(V2)
  await expect(page.locator('.target-ring.zone')).toHaveCount(1)
  await expectRinged(page, rightPane(page), page.locator('.target-ring.zone'))
  await expectRinged(page, snippetRow(page, V2), page.locator('.target-ring:not(.zone)'))
  const zone = await rightPane(page).boundingBox()
  const mark = await coach(page).boundingBox()
  expect(mark.x).toBeGreaterThan(zone.x)
  expect(mark.x + mark.width).toBeLessThan(zone.x + zone.width)

  await snippetRow(page, V2).dragTo(rightPane(page))

  await expect(page.locator('.pane-label[data-side="right"]')).toHaveText(V2)
  await expect(page.locator('.dgv')).toBeVisible()
  await expect(coach(page)).toHaveCount(0)
  const done = page.locator('.tour-done')
  await expect(done).toContainText('Every change, marked on the picture')
  await expect(done).toContainText('Added, removed and changed nodes are coloured.')
  await done.getByRole('button', { name: 'Close' }).click()
  await expect(done).toHaveCount(0)
})

test('closing the comparison before the drop ends the tour quietly', async ({ page }) => {
  await startFromDoneCard(page)
  await openAndCompare(page)
  await expect(coach(page)).toContainText('Drop v2 here')
  await page.locator('.diff-tabs .tab.active .tab-close').click()
  const ask = page.getByRole('dialog')
  if (await ask.count()) await ask.getByRole('button', { name: /Close/ }).first().click()
  await expect(coach(page)).toHaveCount(0)
  await expect(page.locator('.tour-done')).toHaveCount(0)
})
