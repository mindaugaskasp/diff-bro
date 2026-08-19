import { test, expect, newSnippetButton } from './fixtures.mjs'

// jsdom has no editing host, so only a launch proves a person typing into the
// rendered view and the snippet actually changing.

const editorDialog = (page) => page.getByRole('dialog', { name: 'New Snippet' })
const renderedView = (page) => page.locator('.rendered-editor')
const plainButton = (page) => page.getByRole('button', { name: 'Plain', exact: true })
const renderedButton = (page) => page.getByRole('button', { name: 'Rendered', exact: true })

async function openNewSnippet(page, { name, language, body }) {
  await newSnippetButton(page).click()
  const editor = editorDialog(page)
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.lang-picker select').selectOption(language)
  await editor.locator('.editor').click()
  await page.keyboard.type(body)
  return editor
}

// What the Plain (Monaco) view holds — the snippet's actual markup.
const sourceText = (page) =>
  page.locator('.editor .view-lines').evaluate((el) =>
    [...el.querySelectorAll('.view-line')]
      .map((line) => line.textContent.replace(/\u00a0/g, ' '))
      .join('\n')
      .trimEnd()
  )

async function readSource(page) {
  await plainButton(page).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  return sourceText(page)
}

test('the rendered Markdown view takes a caret and writes back to the source', async ({ page }) => {
  await openNewSnippet(page, { name: 'WYSIWYG MD', language: 'markdown', body: '# Title' })
  await renderedButton(page).click()

  const heading = renderedView(page).locator('h1')
  await expect(heading).toHaveText('Title')

  // The whole claim: click into the RENDERED heading and type.
  await heading.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' extended')
  await expect(heading).toHaveText('Title extended')

  expect(await readSource(page)).toBe('# Title extended')
})

test('the rendered Jira view is editable too', async ({ page }) => {
  await openNewSnippet(page, { name: 'WYSIWYG Jira', language: 'jira', body: 'h1. Heading' })
  await renderedButton(page).click()

  const heading = renderedView(page).locator('h1')
  await expect(heading).toHaveText('Heading')
  await heading.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' more')

  expect(await readSource(page)).toBe('h1. Heading more')
})

test('a task checkbox is tickable and writes [x] back', async ({ page }) => {
  await openNewSnippet(page, {
    name: 'WYSIWYG Tasks',
    language: 'markdown',
    body: '- [ ] ship it'
  })
  await renderedButton(page).click()

  const box = renderedView(page).locator('input[type=checkbox]')
  await expect(box).toBeEnabled()
  await expect(box).not.toBeChecked()
  await box.check()

  expect(await readSource(page)).toBe('- [x] ship it')
})

test('the format toolbar works in the rendered view', async ({ page }) => {
  await openNewSnippet(page, { name: 'WYSIWYG Bold', language: 'markdown', body: 'make me bold' })
  await renderedButton(page).click()

  // Select "bold" inside the rendered paragraph, then press the toolbar button.
  const paragraph = renderedView(page).locator('p')
  await paragraph.evaluate((el) => {
    // v-for leaves empty text nodes, so the word is found, not assumed.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node && !node.nodeValue.includes('bold')) node = walker.nextNode()
    const at = node.nodeValue.indexOf('bold')
    const range = document.createRange()
    range.setStart(node, at)
    range.setEnd(node, at + 4)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  })
  await page.getByRole('button', { name: 'Bold' }).click()

  await expect(paragraph.locator('strong')).toHaveText('bold')
  expect(await readSource(page)).toBe('make me **bold**')
})

test('an edit in the rendered view survives a save and reopen', async ({ page }) => {
  const editor = await openNewSnippet(page, {
    name: 'WYSIWYG Persist',
    language: 'markdown',
    body: '# Kept'
  })
  await renderedButton(page).click()
  await renderedView(page).locator('h1').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' across')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()

  const row = page.locator('.snippets-section .row', { hasText: 'WYSIWYG Persist' })
  await expect(row).toBeVisible()
  await row.locator('.entry').click()
  const reopened = page.getByRole('dialog')
  await expect(reopened.locator('.jira-rendered h1')).toHaveText('Kept across')
})

test('a secret snippet shows no plaintext in the rendered view while masked', async ({ page }) => {
  const editor = await openNewSnippet(page, {
    name: 'WYSIWYG Secret',
    language: 'markdown',
    body: '# classified'
  })
  await editor.locator('.secret-toggle input[type="checkbox"]').check()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await page.keyboard.press('Escape')

  const row = page.locator('.snippets-section .row', { hasText: 'WYSIWYG Secret' })
  await row.locator('.entry').click()
  const reopened = page.getByRole('dialog')
  await expect(reopened.locator('.secret-mask')).toBeVisible()
  await expect(reopened.locator('.rendered-editor')).toHaveCount(0)
  expect(await reopened.textContent()).not.toContain('classified')
})

// The view is a reader until Edit is pressed, exactly as Monaco is.
test('the rendered view of a saved snippet is not editable until Edit', async ({ page }) => {
  const editor = await openNewSnippet(page, {
    name: 'WYSIWYG ReadOnly',
    language: 'markdown',
    body: '# Locked'
  })
  await editor.getByRole('button', { name: 'Save', exact: true }).click()

  const row = page.locator('.snippets-section .row', { hasText: 'WYSIWYG ReadOnly' })
  await expect(row).toBeVisible()
  await row.locator('.entry').click()
  const reopened = page.getByRole('dialog')
  await expect(reopened.locator('.jira-rendered')).toBeVisible()
  await expect(reopened.locator('.rendered-editor')).toHaveCount(0)

  await reopened.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(reopened.locator('.rendered-editor')).toBeVisible()
})
