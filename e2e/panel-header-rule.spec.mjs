import { test, expect, showPanel } from './fixtures.mjs'

// A panel's header sat on the same ground as its list with nothing between,
// so the Mine / Received switch read as part of the content.
for (const panel of ['diffs', 'snippets']) {
  test(`the ${panel} panel header is ruled off from its list`, async ({ page }) => {
    await showPanel(page, panel)
    const head = page.locator('.section-head:visible').first()
    await expect(head).toBeVisible()
    const rule = await head.evaluate((el) => {
      const s = getComputedStyle(el)
      const probe = document.createElement('span')
      probe.style.color = 'var(--border)'
      document.body.appendChild(probe)
      const border = getComputedStyle(probe).color
      probe.remove()
      return {
        width: s.borderBottomWidth,
        style: s.borderBottomStyle,
        color: s.borderBottomColor,
        border
      }
    })
    expect(rule.width).toBe('1px')
    expect(rule.style).toBe('solid')
    expect(rule.color).toBe(rule.border)
  })
}
