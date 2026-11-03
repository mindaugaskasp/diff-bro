import { test, expect, openNewSnippet } from './fixtures.mjs'

const editorLines = (page) =>
  page.evaluate(() => {
    const lines = [...document.querySelectorAll('.snippet-doc:not([hidden]) .view-line')]
    lines.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))
    return lines.map((l) => l.textContent.replace(/\u00a0/g, ' '))
  })

async function typeThenEnter(page, line) {
  await openNewSnippet(page)
  await page.getByRole('region', { name: 'New snippet' }).locator('.editor').click()
  await page.keyboard.type(line)
  await page.keyboard.press('Enter')
  await page.keyboard.type('z')
}

// The keystroke that makes a snippet Python is the one before Enter, so its rules must be there already.
for (const attempt of [1, 2, 3, 4, 5]) {
  test(`Enter after the line that reveals Python indents the next one (launch ${attempt})`, async ({
    page
  }) => {
    await typeThenEnter(page, 'def f():')
    await expect.poll(() => editorLines(page)).toEqual(['def f():', '    z'])
  })
}

test('Enter inside braces indents and keeps the closing brace below', async ({ page }) => {
  await typeThenEnter(page, '<?php foreach ($a as $b) {')
  await expect.poll(() => editorLines(page)).toEqual(['<?php foreach ($a as $b) {', '    z', '}'])
})

test('a YAML snippet indents by two, the way YAML is written', async ({ page }) => {
  await openNewSnippet(page)
  await page.locator('.snippet-doc:visible select.lang-select').selectOption('yaml')
  await page.getByRole('region', { name: 'New snippet' }).locator('.editor').click()
  await page.keyboard.type('parent:')
  await page.keyboard.press('Enter')
  await page.keyboard.type('z')
  await expect.poll(() => editorLines(page)).toEqual(['parent:', '  z'])
})

test('pasted code indented by two keeps its own width when its language is set', async ({
  app,
  page
}) => {
  await openNewSnippet(page)
  await page.getByRole('region', { name: 'New snippet' }).locator('.editor').click()
  await app.evaluate(({ clipboard }) => clipboard.writeText('if a:\n  b = 1\n  c = 2\nif d:'))
  await page.keyboard.press('Control+v')
  await page.locator('.snippet-doc:visible select.lang-select').selectOption('python')
  await page.getByRole('region', { name: 'New snippet' }).locator('.editor').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('z')
  await expect
    .poll(() => editorLines(page))
    .toEqual(['if a:', '  b = 1', '  c = 2', 'if d:', '  z'])
})
