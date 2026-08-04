// The tour only exists on a cold profile, so this is the one place its real
// behaviour can be checked: a fresh launch, a relaunch of the SAME profile, and
// an overlay that measures live DOM. jsdom can prove the schedule; only this can
// prove the ring lands on the control the step names.
import {
  test,
  expect,
  clickAppMenuItem,
  firstReadyPage,
  launchApp,
  freshUserDataDir
} from './fixtures.mjs'
import { rmSync } from 'node:fs'

const callout = (page) => page.locator('.tour-callout')
const ring = (page) => page.locator('.tour-ring')

test('a cold launch opens run one on the file slots', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  await expect(callout(page).locator('.tour-step-n')).toHaveText('Step 1 of 4')

  // Step 1 points at the slots, and empty boxes teach nothing — main hands over
  // the shipped demo pair's CONTENTS (never a path the renderer reads back).
  await expect(page.locator('[data-tour="slots"]')).toContainText('demo-config-v1.json')
  await expect(page.locator('[data-tour="slots"]')).toContainText('demo-config-v2.json')

  // The ring must actually cover what the step points at — the failure this
  // guards is a tour that keeps pointing after the layout moves under it.
  const ringBox = await ring(page).boundingBox()
  const slots = await page.locator('[data-tour="slots"]').boundingBox()
  expect(Math.abs(ringBox.x - slots.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(ringBox.width - slots.width)).toBeLessThanOrEqual(2)
})

// Asserted by hit-testing rather than by clicking: a click that passes through
// the veil usually lands on something inert, so the tour survives and the test
// says "fine". elementFromPoint names what would ACTUALLY receive the pointer.
test('the veil takes the pointer outside the hole, and never inside it', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  const probe = await page.evaluate(() => {
    const slots = document.querySelector('[data-tour="slots"]').getBoundingClientRect()
    const inHole = document.elementFromPoint(slots.left + slots.width / 2, slots.top + 4)
    const outside = document.elementFromPoint(30, slots.bottom + 200)
    return {
      inHole: inHole?.closest('[data-tour="slots"]') ? 'target' : (inHole?.className ?? ''),
      outside: outside?.className ?? ''
    }
  })
  // Outside: the tint is in front, so the app underneath cannot be clicked away.
  expect(probe.outside).toContain('tour-tint')
  // Inside: nothing covers the target — the live "press Save" step needs this.
  expect(probe.inHole).toBe('target')
})

test('Escape ends it, and it stays gone across a relaunch', async () => {
  const dir = freshUserDataDir()
  try {
    const first = await launchApp(dir)
    const page = await firstReadyPage(first)
    await expect(callout(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(callout(page)).toBeHidden()
    await first.close()

    const second = await launchApp(dir)
    const back = await firstReadyPage(second)
    await back.waitForTimeout(400)
    await expect(back.locator('.tour-callout')).toBeHidden()
    await second.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('finishing run one asks about run two, and Not now closes it', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  for (let i = 0; i < 4; i++) {
    await callout(page)
      .getByRole('button', { name: /Next|Done/ })
      .click()
  }
  const prompt = page.getByRole('dialog', { name: 'Three more tips?' })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: 'Not now' }).click()
  await expect(prompt).toBeHidden()
  await expect(callout(page)).toBeHidden()
})

test('Show me runs the rest straight away rather than waiting for a relaunch', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  for (let i = 0; i < 4; i++) {
    await callout(page)
      .getByRole('button', { name: /Next|Done/ })
      .click()
  }
  await page.getByRole('button', { name: 'Show me' }).click()
  await expect(callout(page)).toBeVisible()
  await expect(callout(page).locator('.tour-step-n')).toHaveText('Step 1 of 3')
})

test('Skip tips ends it, and Help ▸ Show Tour brings it back', async ({ app, page }) => {
  await expect(callout(page)).toBeVisible()
  await callout(page).getByRole('button', { name: 'Skip tips' }).click()
  await expect(callout(page)).toBeHidden()

  // Asking for it once is not consent to automatic tips, so the replay runs
  // while the setting stays off.
  await clickAppMenuItem(app, 'Show Tour')
  await expect(callout(page)).toBeVisible()
  await expect(callout(page).locator('.tour-step-n')).toHaveText('Step 1 of 7')
})

// A step whose target sits INSIDE a dialog must keep its callout inside that
// dialog too. Placed beside, it straddled the dialog's edge and spilled onto
// the blurred app behind, reading as unrelated to the row it points at.
test('a callout pointing into a dialog stays within it', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  for (let i = 0; i < 3; i++) {
    await callout(page)
      .getByRole('button', { name: /Next|Done/ })
      .click()
  }
  await expect(page.locator('.dialog')).toBeVisible()
  const fits = await page.evaluate(() => {
    const rect = (s) => document.querySelector(s).getBoundingClientRect()
    const c = rect('.tour-callout')
    const d = rect('.dialog')
    return c.left >= d.left - 1 && c.right <= d.right + 1
  })
  expect(fits).toBe(true)
})
