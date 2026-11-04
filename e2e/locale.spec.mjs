import {
  test,
  expect,
  openSettings,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  saveSettings
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

const closeDialog = (page) => saveSettings(page)

const firstTopMenu = (page) => page.locator('.menubar').getByRole('button').first()

test('switching language re-renders the chrome and survives a relaunch', async () => {
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    let page = await firstReadyPage(app)
    await chooseLocale(page, 'en-XA')

    // The picker's own label is in the catalogue, so it flips under itself.
    await expect(page.getByText(/^\[.*\]$/u).first()).toBeVisible()
    await closeDialog(page)

    // The in-app ≡ menu is built from the same catalogue as the native menu,
    // and was a computed for exactly this reason: built once, it would still be
    // showing English here. macOS renders no in-window bar at all (App.vue
    // mounts MenuBar only when !isMac), so there the native check below is the
    // whole test rather than a second opinion.
    if (process.platform !== 'darwin') {
      await expect(await firstTopMenu(page)).toHaveText(PSEUDO)
      await page.keyboard.press('Escape')
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
      await expect(await firstTopMenu(page)).toHaveText(PSEUDO)
      await page.keyboard.press('Escape')
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

const isClipped = (locator) =>
  locator.evaluateAll((els) =>
    els
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .map((el) => `${el.className}: ${el.textContent.trim().slice(0, 40)}`)
  )

test('the daily tip, its Show me and the Tours page fit a longer language', async () => {
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await chooseLocale(page, 'en-XA')
    await page.locator('.settings-nav .nav-item').filter({ hasText: /Ţōūřş/u }).click()
    await expect(page.locator('.ts-bring-back .btn')).toBeVisible()
    expect(
      await isClipped(page.locator('.tours-settings .btn, .tours-settings .setting-toggle'))
    ).toEqual([])
    await closeDialog(page)

    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const store = pinia._s.get('onboarding')
      store.tips = { ...store.tips, on: true, shownOn: null }
      store.noteFront(store.today())
    })
    const card = page.locator('.daily-tip')
    await expect(card).toBeVisible()
    expect(await isClipped(card.locator('.btn, .link-btn, .dt-foot, .dt-head'))).toEqual([])
    const box = await card.boundingBox()
    const view = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
    expect(box.x + box.width).toBeLessThanOrEqual(view.w)
    expect(box.y + box.height).toBeLessThanOrEqual(view.h)

    await card.locator('.btn-primary').click()
    const note = page.locator('.tip-note')
    await expect(note).toBeVisible()
    expect(await isClipped(note)).toEqual([])
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
