import {
  test,
  expect,
  showPanel,
  openNewSnippet,
  docActions,
  clickAppMenuItem
} from '../../e2e/fixtures.mjs'

// #144 slice 4, open question: how the sidebar is shown and hidden once the rail
// is gone. Drawn over the live app (slices 1–3 real), approved sidebar patches
// applied, expanded and collapsed. A–C (bar buttons) were rendered earlier.
const OUT = 'design/render/out/sidebar'

const QUIET_SIDE = `
  .usb-shelf { display: none !important; }
  .monogram.glyph-well { background: transparent !important; color: var(--text-meta) !important; }
  .row .when { visibility: hidden; }
  .section-head .actions-slot .btn:not(:first-child) { display: none; }`

function patchSidebar() {
  const clear = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent'
  let band = document.querySelector('.usb-top')
  while (band && clear(getComputedStyle(band).backgroundColor)) band = band.parentElement
  if (band) {
    band.style.background = 'var(--bg-panel)'
    band.style.borderBottom = '0'
  }
  const slot = document.querySelector('.section-head .actions-slot')
  if (slot && !slot.querySelector('[aria-label="More"]')) {
    const more = document.createElement('button')
    more.className = 'btn btn-icon'
    more.setAttribute('aria-label', 'More')
    more.innerHTML =
      '<svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>'
    slot.append(more)
  }
  const rail = document.querySelector('.rail')
  const items = [...rail.querySelectorAll('.rail-item')].filter((i) => i.dataset.panel !== 'keys')
  const seg = document.createElement('div')
  seg.className = 'dk-seg'
  seg.style.cssText =
    'display:flex;align-items:center;gap:2px;height:31px;box-sizing:border-box;padding:0 10px;border-bottom:1px solid var(--border)'
  const inner = document.createElement('div')
  inner.style.cssText =
    'display:flex;flex:1;gap:2px;padding:2px;border-radius:var(--radius);background:color-mix(in srgb, var(--text) 7%, var(--bg-panel))'
  items.forEach((item) => {
    const b = document.createElement('button')
    const on = item.classList.contains('on')
    b.className = 'btn btn-sm'
    b.style.cssText = `flex:1;height:22px;justify-content:center;box-shadow:none;${on ? 'background:var(--bg);' : ''}`
    b.append(item.querySelector('svg').cloneNode(true))
    inner.append(b)
  })
  seg.append(inner)
  const top = document.querySelector('.usb-top').parentElement
  top.parentElement.insertBefore(seg, top)
  rail.style.display = 'none'
  return seg
}

// D and E keep the control out of every bar: a handle on the sidebar's edge
// (shown as hovered), and when collapsed a strip at the window's left edge.
function drawEdge([place, state]) {
  const chevron = (d) =>
    `<svg style="width:12px;height:12px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`
  const pill = (left, d, radius) => {
    const el = document.createElement('div')
    el.style.cssText = `position:fixed;z-index:50;top:calc(50% - 20px);left:${left}px;width:16px;height:40px;display:grid;place-items:center;border-radius:${radius};background:var(--bg-raised);border:1px solid var(--border);box-shadow:var(--shadow-1);color:var(--text-meta)`
    el.innerHTML = chevron(d)
    document.body.append(el)
  }
  if (state === 'collapsed') return pill(-1, 'm9 6 6 6-6 6', '0 8px 8px 0')
  if (place === 'edge') {
    const right = document.querySelector('.saved').getBoundingClientRect().right
    return pill(right - 8, 'm15 6-6 6 6 6', '8px')
  }
  const on = [...document.querySelectorAll('.dk-seg button')].find(
    (b) => b.style.background === 'var(--bg)'
  )
  if (!on) return
  const r = on.getBoundingClientRect()
  on.style.outline = '1px solid var(--accent)'
  const tip = document.createElement('div')
  tip.textContent = 'Click again to hide the sidebar'
  tip.style.cssText = `position:fixed;z-index:50;top:${r.bottom + 6}px;left:${r.left - 40}px;padding:4px 8px;border-radius:var(--radius-sm);background:var(--text);color:var(--bg);font-size:var(--font-sm);white-space:nowrap`
  document.body.append(tip)
}

const PLACES = ['edge', 'segment']

async function createSnippet(page, name, body) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type(body)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme)

for (const theme of ['light', 'dark']) {
  test(`sidebar toggle ${theme}`, async ({ app, page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await createSnippet(page, 'Restart api', 'kubectl rollout restart deployment/api')
    await createSnippet(page, 'Find slow queries', 'select query from pg_stat_statements')
    for (const place of PLACES) {
      for (const state of ['open', 'collapsed']) {
        await page.reload()
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(600)
        if ((await themeOf(page)) !== theme) await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
        await expect.poll(() => themeOf(page)).toBe(theme)
        await showPanel(page, 'snippets')
        await page.locator('li.row', { hasText: 'Restart api' }).click()
        await page.addStyleTag({ content: QUIET_SIDE })
        await page.evaluate(patchSidebar)
        if (state === 'collapsed') {
          await page.evaluate(() => {
            document.querySelector('.saved').style.display = 'none'
          })
        }
        await page.evaluate(drawEdge, [place, state])
        await page.waitForTimeout(400)
        await page.mouse.move(1270, 790)
        await page.screenshot({ path: `${OUT}/${place}-${state}-${theme}.png` })
      }
    }
  })
}
