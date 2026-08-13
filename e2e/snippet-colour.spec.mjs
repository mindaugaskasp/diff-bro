import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  newSnippetButton
} from './fixtures.mjs'

// A colour the reader picks, painted across the whole row. It is decoration —
// nothing filters, searches or sorts by it — so what has to hold is that it
// SHOWS, that it stays readable on every ground, and that it never eats a state
// the row already had. Only a launched app resolves `oklch(from …)` and
// `color-mix`, so the contrast claims are measured here rather than asserted
// against a stylesheet.

const row = (page, name) => page.locator('.snippets-section .row', { hasText: name })
const menu = (page) => page.locator('.rcm')

async function seedSnippet(page, name) {
  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type('seeded body')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

const openMenu = async (page, name) => {
  await row(page, name).click({ button: 'right' })
  await expect(menu(page)).toBeVisible()
}

const pick = async (page, color) => {
  await menu(page).locator(`[data-color="${color}"]`).click()
  await expect(menu(page)).toHaveCount(0)
}

// WCAG contrast between the row's own ink and the ground it actually paints,
// read off the live DOM — the wash is a color-mix over the panel, so nothing
// short of a real render knows what it resolves to.
const contrastOfName = (page, name) =>
  row(page, name).evaluate((el) => {
    const lum = (c) => {
      const [r, g, b] = c
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map((v) => {
          const x = Number(v) / 255
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
        })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    // The row's background is a mix over the panel; walk up for the ground it
    // lands on so the ratio is what the eye actually gets.
    const ground = (node) => {
      for (let el = node; el; el = el.parentElement) {
        const bg = getComputedStyle(el).backgroundColor
        const alpha = Number(bg.match(/[\d.]+/g)?.[3] ?? 1)
        if (alpha === 1) return bg
      }
      return 'rgb(255, 255, 255)'
    }
    const paint = (over, under) => {
      const a = over.match(/[\d.]+/g).map(Number)
      const b = under.match(/[\d.]+/g).map(Number)
      const alpha = a[3] ?? 1
      return `rgb(${[0, 1, 2].map((i) => a[i] * alpha + b[i] * (1 - alpha)).join(',')})`
    }
    const ink = getComputedStyle(el.querySelector('.nm')).color
    const bg = paint(getComputedStyle(el).backgroundColor, ground(el.parentElement))
    const [hi, lo] = [lum(ink), lum(bg)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  })

test('right-click paints the row, and the menu remembers what it is', async ({ page }) => {
  test.setTimeout(120_000)
  await seedSnippet(page, 'Deploy rollback')

  // No colour to start with, so nothing about the row says there could be one.
  await expect(row(page, 'Deploy rollback')).not.toHaveAttribute('data-color', /./)

  await openMenu(page, 'Deploy rollback')
  await pick(page, 'blue')
  await expect(row(page, 'Deploy rollback')).toHaveAttribute('data-color', 'blue')

  // The wash and the 3px edge are both painted, and neither is the panel.
  const paint = await row(page, 'Deploy rollback').evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    edge: getComputedStyle(el).boxShadow
  }))
  expect(paint.bg).not.toMatch(/rgba\(0, 0, 0, 0\)/)
  expect(paint.edge).toMatch(/inset/)

  // Reopening lands on what the row already is — a menu that opens on someone
  // else's answer recolours by accident.
  await openMenu(page, 'Deploy rollback')
  await expect(menu(page).locator('[data-color="blue"]')).toHaveAttribute('aria-checked', 'true')
  await expect(menu(page).locator('[data-color="none"]')).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)
  await expect(row(page, 'Deploy rollback')).toHaveAttribute('data-color', 'blue')
})

test('None takes it off again', async ({ page }) => {
  test.setTimeout(120_000)
  await seedSnippet(page, 'Standup notes')
  await openMenu(page, 'Standup notes')
  await pick(page, 'rose')
  await expect(row(page, 'Standup notes')).toHaveAttribute('data-color', 'rose')

  await openMenu(page, 'Standup notes')
  await pick(page, 'none')
  await expect(row(page, 'Standup notes')).not.toHaveAttribute('data-color', /./)
})

test('the keyboard drives the menu without the pointer', async ({ page }) => {
  test.setTimeout(120_000)
  await seedSnippet(page, 'Kafka lag query')
  await openMenu(page, 'Kafka lag query')

  // Opens on None (no colour yet); Home is the first colour, → steps on.
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(menu(page)).toHaveCount(0)
  await expect(row(page, 'Kafka lag query')).toHaveAttribute('data-color', 'amber')
})

// The claim the design rests on: the name stays readable on the wash. Measured
// on a light ground and on a dark one, for every colour in the palette.
test('every colour keeps the name above the reading floor, light and dark', async ({ page }) => {
  test.setTimeout(180_000)
  await seedSnippet(page, 'Contrast probe')
  const was = await page.evaluate(() => document.documentElement.dataset.theme)

  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    for (const colour of ['rose', 'amber', 'green', 'teal', 'blue', 'violet']) {
      await openMenu(page, 'Contrast probe')
      await pick(page, colour)
      const ratio = await contrastOfName(page, 'Contrast probe')
      expect(ratio, `${colour} on ${theme}`).toBeGreaterThanOrEqual(4.5)
    }
  }
  // Put back exactly what was there, rather than toggling to whatever is next.
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), was)
})

test('the launcher shows the colour, and it survives a relaunch', async () => {
  test.setTimeout(120_000)
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await seedSnippet(page, 'Deploy rollback')
    await openMenu(page, 'Deploy rollback')
    await pick(page, 'violet')
  } finally {
    await app.close()
  }

  app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await expect(row(page, 'Deploy rollback')).toHaveAttribute('data-color', 'violet')

    const [ql] = await Promise.all([
      app.waitForEvent('window'),
      page.evaluate(() => window.api.quickLookToggle())
    ])
    await ql.waitForLoadState('domcontentloaded')
    await ql.locator('.ql-input').fill('Deploy rollback')
    // Not the create row, which a `hasText` match picks up as well.
    const result = ql.locator('.ql-res:not(.ql-res-create)', { hasText: 'Deploy rollback' })
    await expect(result).toHaveAttribute('data-color', 'violet')
    // Selected AND coloured: the accent keyline returns, the colour stays.
    await expect(result).toHaveClass(/sel/)
    const shown = await result.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shown).toMatch(/inset/)
  } finally {
    await app.close()
  }
})
