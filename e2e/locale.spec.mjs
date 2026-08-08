import {
  test,
  expect,
  openSettings,
  launchApp,
  freshUserDataDir,
  firstReadyPage
} from './fixtures.mjs'
import { rmSync } from 'node:fs'

// The pseudolocale is the only thing that can see an un-extracted string, and a
// real launch is the only thing that can see the application menu. Neither is
// reachable from a unit test: jsdom never mounts the menu, and `npm run check`
// only proves every key RESOLVES, not that the UI asks for one.
//
// en-XA brackets and pads every message (scripts/lib/pseudo.mjs), so:
//   bracketed  → the string came from the catalogue
//   plain ASCII → it is still hardcoded in a template
const PSEUDO = /^\[.*\]$/u

const chooseLocale = async (page, id) => {
  await openSettings(page)
  await page.getByRole('combobox', { name: /Language|Łàńğūàğé/u }).selectOption(id)
}

const closeDialog = (page) => page.keyboard.press('Escape')

test('switching language re-renders the chrome and survives a relaunch', async () => {
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    let page = await firstReadyPage(app)
    await chooseLocale(page, 'en-XA')

    // The picker's own label is in the catalogue, so it flips under itself.
    await expect(page.getByText(/^\[.*\]$/u).first()).toBeVisible()
    await closeDialog(page)

    // The in-app menu bar is built from the same catalogue as the native menu,
    // and was a computed for exactly this reason: built once, it would still be
    // showing English here. macOS renders no in-window bar at all (App.vue
    // mounts MenuBar only when !isMac), so there the native check below is the
    // whole test rather than a second opinion.
    if (process.platform !== 'darwin') {
      await expect(page.locator('.menubar button').first()).toHaveText(PSEUDO)
    }

    // The APPLICATION menu lives in main, built from a template at startup, so
    // this proves main picked the change up rather than only the renderer.
    const nativeLabels = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu().items.map((i) => i.label)
    )
    expect(nativeLabels.some((l) => /^\[.*\]$/u.test(l))).toBe(true)

    await app.close()

    // Relaunch the SAME profile: the choice is persisted in settings.json and
    // main reads it back before the menu is built.
    app = await launchApp(dir)
    page = await firstReadyPage(app)
    if (process.platform !== 'darwin') {
      await expect(page.locator('.menubar button').first()).toHaveText(PSEUDO)
    }
    const afterRelaunch = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu().items.map((i) => i.label)
    )
    expect(afterRelaunch.some((l) => /^\[.*\]$/u.test(l))).toBe(true)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// 35 stylesheets set `white-space: nowrap`. Text expansion is what breaks them,
// and it is invisible in English. The pseudolocale pads ~40%, which is roughly
// what German and Finnish do to short UI strings.
test('no control clips its label in a longer language', async ({ page }) => {
  await chooseLocale(page, 'en-XA')
  await closeDialog(page)

  const { clipped, examined } = await page.evaluate(() => {
    const out = []
    let seen = 0
    for (const el of document.querySelectorAll('.btn, .menubar button, .nav-item, .band button')) {
      if (!el.offsetParent) continue
      seen++
      // 1px of slack: sub-pixel layout rounds either way and would flake.
      if (el.scrollWidth > el.clientWidth + 1) {
        out.push(`${el.className}: ${el.textContent.trim().slice(0, 40)}`)
      }
    }
    return { clipped: out, examined: seen }
  })
  // Or an empty result would mean "found nothing", not "nothing clips".
  expect(examined, 'visible controls the check actually measured').toBeGreaterThan(5)
  expect(clipped, 'controls whose label overflows its box').toEqual([])
})
