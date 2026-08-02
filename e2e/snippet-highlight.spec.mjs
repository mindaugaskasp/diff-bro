import { test, expect } from './fixtures.mjs'

// Highlighting is only real in a launched app: Monaco does the tokenising, it
// cannot be imported under vitest, and JSON in particular only tokenises once a
// model of that language has existed. jsdom can answer none of that.

async function addSnippet(page, { name, language, body, secret = false }) {
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.lang-picker select').selectOption(language)
  await editor.locator('.editor').click()
  await page.keyboard.type(body)
  if (secret) await editor.locator('.secret-toggle input[type="checkbox"]').check()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  // Saving opens the read-only view; close it so the sidebar row is hoverable.
  await page.keyboard.press('Escape')
  await expect(page.locator('.snippets-section .row', { hasText: name })).toBeVisible()
}

const previewOf = async (page, name) => {
  await page.mouse.move(0, 0)
  await page.locator('.snippets-section .row', { hasText: name }).hover()
  const card = page.locator('.preview')
  await expect(card).toBeVisible()
  return card
}

// The roles the preview paints with; each maps to a --syn-* token.
const rolesIn = (card) =>
  card
    .locator('.syn-line span[class^="syn-"]')
    .evaluateAll((els) => [...new Set(els.map((e) => e.className.replace('syn-', '')))].sort())

test('a JSON snippet previews with its keys, values and numbers coloured', async ({ page }) => {
  await addSnippet(page, {
    name: 'Highlight JSON',
    language: 'json',
    body: '{\n  "name": "bro",\n  "count": 42\n}'
  })
  const card = await previewOf(page, 'Highlight JSON')

  // JSON is the one language Monaco does NOT tokenise until a model of it has
  // existed — the whole reason the composable warms the language first.
  expect(await rolesIn(card)).toEqual(expect.arrayContaining(['number', 'property', 'string']))
})

test('a YAML snippet colours its keys and comments', async ({ page }) => {
  await addSnippet(page, {
    name: 'Highlight YAML',
    language: 'yaml',
    body: '# a note\nreplicas: 3\nname: bro'
  })
  const card = await previewOf(page, 'Highlight YAML')
  expect(await rolesIn(card)).toEqual(expect.arrayContaining(['comment', 'property']))
})

// Colour must not come at the cost of the text being right. YAML, because
// Monaco auto-closes brackets and re-indents JSON as it is typed — the snippet
// would differ from the string this test sent, for reasons that are nothing to
// do with highlighting.
test('the highlighted text is exactly the snippet, character for character', async ({ page }) => {
  const body = '# totals\nreplicas: 3\nname: bro'
  await addSnippet(page, { name: 'Exact YAML', language: 'yaml', body })
  const card = await previewOf(page, 'Exact YAML')
  const shown = await card
    .locator('.syn')
    .evaluate((el) => [...el.querySelectorAll('.syn-line')].map((l) => l.textContent).join('\n'))
  expect(shown).toBe(body)
})

test('plain text is left uncoloured rather than guessed at', async ({ page }) => {
  await addSnippet(page, {
    name: 'Just Words',
    language: 'plaintext',
    body: 'const not really code'
  })
  const card = await previewOf(page, 'Just Words')
  expect(await rolesIn(card)).toEqual([])
  await expect(card.locator('.syn')).toContainText('const not really code')
})

// The colours are --syn-* tokens, so they re-tint per theme rather than being
// baked in. If they resolved to nothing the code would render invisible.
test('the syntax colours come from the theme, and change with it', async ({ page }) => {
  await addSnippet(page, {
    name: 'Themed JSON',
    language: 'json',
    body: '{"k": 1}'
  })
  const read = async () => {
    const card = await previewOf(page, 'Themed JSON')
    return card
      .locator('.syn-number')
      .first()
      .evaluate((el) => getComputedStyle(el).color)
  }
  const light = await read()
  expect(light).toMatch(/^rgb/)

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'matrix'))
  const matrix = await read()
  expect(matrix).toMatch(/^rgb/)
  expect(matrix).not.toBe(light)
})

// A secret is never decrypted for a preview at all, so it can never be
// tokenised either — the mask stands in for the body.
test('a secret snippet is masked, never highlighted', async ({ page }) => {
  await addSnippet(page, {
    name: 'Highlight Secret',
    language: 'json',
    body: '{"token": "s3cret-value"}',
    secret: true
  })
  const card = await previewOf(page, 'Highlight Secret')
  // A secret is never decrypted for a preview at all, so it can never be
  // tokenised either — the mask stands in for the body.
  expect(await card.innerText()).not.toContain('s3cret-value')
  await expect(card.locator('.syn')).toHaveCount(0)
})
