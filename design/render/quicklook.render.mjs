import { test, expect, openNewSnippet, docActions, clickAppMenuItem } from '../../e2e/fixtures.mjs'

// #142: Quick Look-up redesigned, drawn over the live launcher at one fixed size.
const OUT = 'design/render/out/quicklook'
const ONLY = process.env.VARIANTS?.split(',')
const FIXED = { width: 760, height: 480 }

const DECIDED = `
  :root { --btn-face: transparent; --btn-edge: transparent; --font-md: 13px; --font-sm: 12px; --font-xs: 11px; }
  body { font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; }
  .btn:not(.btn-primary) { box-shadow: none; }
  .btn:disabled:not(.btn-primary) { border-color: transparent; }
  .monogram { background: transparent !important; color: var(--text-meta) !important; }`

const SPOTLIGHT = `
  .ql { background: var(--bg-raised) !important; border-radius: 16px !important; }
  .ql-search { min-height: 56px !important; border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent) !important; background: transparent !important; }
  .ql-input { font-size: 20px !important; font-weight: 400 !important; border: 0 !important; background: transparent !important; box-shadow: none !important; }
  .ql-search .ql-kbd, .ql-foot { display: none !important; }
  .ql-res { border-radius: 8px !important; margin: 1px 6px !important; }
  .ql-pv-head { border-bottom: 0 !important; background: transparent !important; }
  .ql-pv-foot { border-top: 0 !important; background: transparent !important; }
  .ql-preview { border-left: 1px solid color-mix(in srgb, var(--text) 8%, transparent) !important; background: transparent !important; }`

const SINGLE = `
  ${SPOTLIGHT}
  .ql-body { display: flex !important; flex-direction: column !important; grid-template-columns: none !important; }
  .ql-results { width: auto !important; max-width: none !important; height: 168px !important; max-height: 168px !important; flex: none !important; border-bottom: 1px solid color-mix(in srgb, var(--text) 8%, transparent); }
  .ql-preview { width: auto !important; max-width: none !important; border-left: 0 !important; flex: 1 1 auto !important; min-height: 0 !important; }`

const LIST = `
  ${SPOTLIGHT}
  .ql-body { display: flex !important; flex-direction: column !important; grid-template-columns: none !important; }
  .ql-results { width: auto !important; max-width: none !important; flex: 1 1 auto !important; }
  .ql-preview { display: none !important; }
  .ql-preview:has(.ql-compose) { display: flex !important; position: absolute !important; inset: 0 !important; z-index: 5; background: var(--bg-raised) !important; width: auto !important; }
  .ql-compose-head { border-bottom: 0 !important; background: transparent !important; }
  .ql-compose-foot { border-top: 0 !important; background: transparent !important; }
  .ql-compose .ql-foot { display: none !important; }
  .ql-compose-name, .ql-compose-field, .ql-compose input { border-color: transparent !important; background: color-mix(in srgb, var(--text) 6%, var(--bg-raised)) !important; box-shadow: none !important; }
  .ql-compose textarea { border-color: transparent !important; box-shadow: none !important; }
  .ql-compose-lang { border: 0 !important; background: transparent !important; box-shadow: none !important; text-transform: none !important; letter-spacing: 0 !important; text-decoration: underline; text-underline-offset: 3px; color: var(--text-meta) !important; }`

const EDIT_NOTES = `
  ${LIST}
  .ql-compose-head { min-height: 0 !important; padding: 14px 20px 0 !important; }
  .ql-compose-title { display: none !important; }
  .ql-compose-body { padding: 0 20px !important; gap: 4px !important; }
  .ql-compose-name, .ql-compose input { font-size: 20px !important; font-weight: 600 !important; background: transparent !important; padding-left: 0 !important; }
  .ql-compose-field { background: transparent !important; border: 0 !important; }
  .ql-compose-hl, .ql-compose-text { padding-left: 0 !important; }
  .ql-compose-foot { padding: 8px 20px 14px !important; }
  .ql-compose-head .ql-compose-lang { position: absolute !important; left: 20px; bottom: 22px; z-index: 2; }
  .ql-compose-foot { justify-content: flex-end !important; }
  .ql-compose-body input, .ql-compose-name { border-color: transparent !important; box-shadow: none !important; outline: 0 !important; }
  .ql-compose .ghost-field, .ql-compose .ghost-field * { border-color: transparent !important; box-shadow: none !important; outline: 0 !important; background: transparent !important; }
  .ql-preview:has(.ql-compose) { border: 0 !important; box-shadow: none !important; outline: 0 !important; }
  .ql-preview:has(.ql-compose)::before, .ql-preview:has(.ql-compose)::after { display: none !important; }`
const EDIT_SHEET = `
  ${EDIT_NOTES}
  .ql-compose-name, .ql-compose input { font-size: 15px !important; }`
// The sheet's header carries ← back, the name and Save on one row.
const SHEET_HEAD = () => {
  const head = document.querySelector('.ql-compose-head')
  const name =
    document.querySelector('.ql-compose-body .ql-compose-name')?.closest('div') ??
    document.querySelector('.ql-compose-body > :first-child')
  const save = [...document.querySelectorAll('.ql-compose button')].find((b) =>
    /Save/.test(b.textContent)
  )
  if (!head || !name || !save) return
  const back = document.createElement('button')
  back.className = 'btn btn-icon'
  back.setAttribute('aria-label', 'Back to results')
  back.innerHTML =
    '<svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>'
  head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px !important'
  name.style.flex = '1'
  head.prepend(back)
  head.insertBefore(name, back.nextSibling)
  head.append(save)
  const cancel = [...document.querySelectorAll('.ql-compose button')].find((b) =>
    /Cancel/.test(b.textContent)
  )
  if (cancel) cancel.style.display = 'none'
}

const VARIANTS = {
  list: LIST,
  'edit-notes': EDIT_NOTES,
  'edit-sheet': { css: EDIT_SHEET, js: [SHEET_HEAD] },
  today: '',
  spotlight: SPOTLIGHT,
  single: SINGLE
}

async function createSnippet(page, name, body) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type(body)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function summon(app, page) {
  const open = app.windows().find((w) => !w.isClosed() && w.url().includes('quicklook'))
  if (open) {
    await page.evaluate(() => window.api.quickLookToggle())
    const shown = await open
      .locator('.ql-search input')
      .isVisible({ timeout: 1500 })
      .catch(() => false)
    if (!shown) await page.evaluate(() => window.api.quickLookToggle())
    await expect(open.locator('.ql-search input')).toBeVisible()
    await open.locator('.ql-search input').fill('')
    return open
  }
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => window.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await expect(ql.locator('.ql-search input')).toBeVisible()
  return ql
}

// The launcher is pinned to one size in every state: compose no longer grows it.
const pinSize = (app) =>
  app.evaluate(({ BrowserWindow }, size) => {
    const w = BrowserWindow.getAllWindows().find((x) =>
      x.webContents.getURL().includes('quicklook')
    )
    w.setResizable(true)
    w.setSize(size.width, size.height)
    w.setResizable(false)
  }, FIXED)

const STATES = {
  results: async (ql) => {
    await ql.locator('.ql-search input').fill('a')
    await expect(ql.locator('.ql-res').first()).toBeVisible()
  },
  preview: async (ql) => {
    await ql.locator('.ql-search input').fill('restart')
    await expect(ql.locator('.ql-res').first()).toBeVisible()
    await ql.keyboard.press('ArrowRight')
  },
  edit: async (ql) => {
    await ql.locator('.ql-search input').fill('restart')
    await expect(ql.locator('.ql-res').first()).toBeVisible()
    await ql.keyboard.press('ArrowRight')
    await ql.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await expect(ql.locator('.ql-compose')).toBeVisible()
  },
  compose: async (ql) => {
    await ql.locator('.ql-search input').fill('Scale api')
    await ql.keyboard.press('Control+n')
    await expect(ql.locator('.ql-compose')).toBeVisible()
    await ql.keyboard.type('kubectl scale deployment/api --replicas=5')
  }
}

async function renderState({ app, page, go, css, path }) {
  const spec = typeof css === 'string' ? { css, js: [] } : css
  const ql = await summon(app, page)
  await go(ql)
  await pinSize(app)
  await ql.evaluate((text) => {
    const style = document.createElement('style')
    style.textContent = text
    document.head.append(style)
  }, DECIDED + spec.css)
  for (const step of spec.js) await ql.evaluate(step)
  await ql.waitForTimeout(500)
  await ql.screenshot({ path })
  // A fresh launcher per state: a draft or a parked search must not leak into the next.
  const closed = ql.waitForEvent('close')
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((x) => x.webContents.getURL().includes('quicklook'))
      ?.destroy()
  )
  await closed
}

const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme)

for (const theme of ['light', 'dark']) {
  test(`quicklook ${theme}`, async ({ app, page }) => {
    if ((await themeOf(page)) !== theme) await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
    await expect.poll(() => themeOf(page)).toBe(theme)
    await createSnippet(
      page,
      'Restart api',
      'kubectl rollout restart deployment/api\nkubectl rollout status deployment/api'
    )
    await createSnippet(page, 'Drain a node', 'kubectl drain node-1 --ignore-daemonsets')
    await createSnippet(page, 'Tail pod logs', 'kubectl logs -f deploy/api --since=10m')
    for (const [variant, css] of Object.entries(VARIANTS)) {
      if (ONLY && !ONLY.includes(variant)) continue
      for (const [state, go] of Object.entries(STATES)) {
        if (variant.startsWith('edit-') && !['edit', 'compose'].includes(state)) continue
        await renderState({ app, page, go, css, path: `${OUT}/${variant}-${state}-${theme}.png` })
      }
    }
  })
}
