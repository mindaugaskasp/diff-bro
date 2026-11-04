import { test, expect, docActions } from './fixtures.mjs'
import { finishCoreTour, expectRinged } from './onboardingTour.mjs'

test.use({ tips: true })

const coach = (page) => page.locator('.coach-mark')
const fillDialog = (page) => page.getByRole('dialog', { name: /^Fill in/ })
const copyButton = (page) => docActions(page).getByRole('button', { name: 'Copy', exact: true })
const saveButton = (page) => docActions(page).getByRole('button', { name: 'Save', exact: true })
const today = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function startFromDoneCard(page) {
  await finishCoreTour(page)
  const done = page.locator('.tour-done')
  await expect(done).toContainText('Two more, a minute each, whenever you like:')
  await done.getByRole('button', { name: 'Snippets', exact: true }).click()
  await expect(done).toHaveCount(0)
  await expect(coach(page)).toContainText('Snippets · 1 of 4')
}

async function pressPlus(page) {
  await expect(coach(page)).toContainText('Keep text you reuse')
  await expectRinged(page, page.locator('[data-tour="snippet-new"]'))
  await page.locator('[data-tour="snippet-new"]').click()
  await expect(coach(page)).toContainText('Snippets · 2 of 4')
}

async function nameAndSave(page) {
  await expect(coach(page)).toContainText('Snippets · 3 of 4')
  await expect(coach(page)).toContainText('Name it, then Save')
  await expect(page.locator('.target-ring')).toHaveCount(2)
  await page.locator('[data-tour="snippet-name"] input').fill('Deploy note')
  await saveButton(page).click()
  await expect(coach(page)).toContainText('Snippets · 4 of 4')
}

test('+, a blank, name and Save, Copy and fill: the whole Snippets tour', async ({ app, page }) => {
  await startFromDoneCard(page)
  await pressPlus(page)
  await expect(coach(page)).toContainText('Leave a blank to fill in later')
  await expect(coach(page).locator('.cm-body .ql-kbd')).toHaveText(['{{service}}', '{{today}}'])
  await expect(coach(page).locator('.cm-body')).toHaveText(
    'Type anything with a blank in double braces, like {{service}}. {{today}} fills in the date by itself.'
  )

  await page.locator('[data-tour="snippet-body"] .monaco-editor').first().click()
  await page.keyboard.insertText('Deploying {{service}} to staging on {{today}}')
  await nameAndSave(page)

  await expect(coach(page)).toContainText('Copy it, and fill the blank')
  await expectRinged(page, copyButton(page))
  await copyButton(page).click()
  await expect(fillDialog(page)).toBeVisible()
  await expect(coach(page)).toContainText('Fill it, then Copy filled')
  const dialogBox = await fillDialog(page).boundingBox()
  const coachBox = await coach(page).boundingBox()
  expect(coachBox.x).toBeGreaterThanOrEqual(dialogBox.x + dialogBox.width)

  const row = (name) => fillDialog(page).locator('.fill-row', { hasText: name })
  await expect(row('today').getByRole('textbox')).toHaveValue(today())
  await row('service').getByRole('textbox').fill('billing')
  await fillDialog(page).getByRole('button', { name: 'Copy filled' }).click()

  await expect(coach(page)).toHaveCount(0)
  await expect(page.locator('.tour-done')).toHaveCount(0)
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe(`Deploying billing to staging on ${today()}`)
})

test('Use a sample fills the line; Cancel in Fill in leaves the tour waiting', async ({ page }) => {
  await startFromDoneCard(page)
  await pressPlus(page)
  await coach(page).getByRole('button', { name: 'Use a sample' }).click()
  await expect(page.locator('[data-tour="snippet-body"] .view-lines')).toHaveText(
    'Deploying {{service}} to staging on {{today}}'
  )
  await nameAndSave(page)

  await copyButton(page).click()
  await fillDialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(fillDialog(page)).toHaveCount(0)
  await expect(coach(page)).toContainText('Copy it, and fill the blank')

  await page.keyboard.press('Escape')
  await expect(coach(page)).toContainText('Snippets · 4 of 4')
})

test('closing the tour’s snippet before the end ends it quietly', async ({ page }) => {
  await startFromDoneCard(page)
  await pressPlus(page)
  await page.locator('.diff-tabs .tab.active .tab-close').click()
  await expect(coach(page)).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
