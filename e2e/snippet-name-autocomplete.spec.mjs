import { test, expect } from './fixtures.mjs'

// Inline ghost text for the snippet NAME. The rule under test is
// shell-completion: complete to the longest common prefix of every matching
// name, never to the part that tells two snippets apart.
const EXAMPLE = 'Example — Mermaid diagram'

async function summon(app, page) {
  await expect(page.getByText(EXAMPLE)).toBeVisible()
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => window.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await expect(ql.locator('.ql-input')).toBeVisible()
  return ql
}

// Two names sharing a head and differing after it.
async function seedDeployPair(ql) {
  for (const name of ['Deploy — prod', 'Deploy — staging']) {
    await ql.keyboard.press('ControlOrMeta+n')
    await ql.locator('.ql-compose-name').fill(name)
    await ql.locator('.ql-compose-text').fill('echo ' + name)
    await ql.keyboard.press('ControlOrMeta+Enter')
    await expect(ql.locator('.ql-compose')).toBeHidden()
  }
}

test('completes to the shared head and no further', async ({ app, page }) => {
  const ql = await summon(app, page)
  await seedDeployPair(ql)

  await ql.keyboard.press('ControlOrMeta+n')
  await ql.locator('.ql-compose-name').fill('Dep')

  // Both names match, so the ghost stops where they stop agreeing.
  await expect(ql.locator('.name-ghost')).toHaveText('loy — ')
  // And it is NOT part of the value — that is what makes it a suggestion.
  await expect(ql.locator('.ql-compose-name')).toHaveValue('Dep')
})

test('Tab accepts the ghost and the saved name is what was on screen', async ({ app, page }) => {
  const ql = await summon(app, page)
  await seedDeployPair(ql)

  await ql.keyboard.press('ControlOrMeta+n')
  await ql.locator('.ql-compose-name').focus()
  await ql.keyboard.type('Dep')
  await ql.keyboard.press('Tab')
  await expect(ql.locator('.ql-compose-name')).toHaveValue('Deploy — ')

  await ql.keyboard.type('canary')
  await ql.locator('.ql-compose-text').fill('echo canary')
  await ql.keyboard.press('ControlOrMeta+Enter')

  await ql.locator('.ql-input').fill('Deploy — canary')
  await expect(
    ql.locator('.ql-res:not(.ql-res-create)', { hasText: 'Deploy — canary' })
  ).toHaveCount(1)
})

test('one match completes the whole name', async ({ app, page }) => {
  const ql = await summon(app, page)
  await seedDeployPair(ql)

  await ql.keyboard.press('ControlOrMeta+n')
  await ql.locator('.ql-compose-name').fill('Deploy — s')
  await expect(ql.locator('.name-ghost')).toHaveText('taging')
})

test('offers nothing for a name nothing matches', async ({ app, page }) => {
  const ql = await summon(app, page)
  await seedDeployPair(ql)

  await ql.keyboard.press('ControlOrMeta+n')
  await ql.locator('.ql-compose-name').fill('zzz')
  await expect(ql.locator('.name-ghost')).toHaveText('')
})

// The editor has its own name field, and SnippetNameHint already sits under it.
test('the editor completes too, and the template hint still shows', async ({ page }) => {
  await expect(page.getByText(EXAMPLE)).toBeVisible()
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })

  // Two seeded snippets are named `Example — …`, so the same LCP rule applies
  // here as in the launcher: it stops where they stop agreeing.
  await editor.getByPlaceholder('Snippet name…').fill('Exam')
  await expect(editor.locator('.name-ghost')).toHaveText('ple — ')

  // Past the fork, one match remains and the whole name is offered.
  await editor.getByPlaceholder('Snippet name…').fill('Example — M')
  await expect(editor.locator('.name-ghost')).toHaveText('ermaid diagram')
  // The two occupy different space and must not displace each other.
  await expect(editor.locator('.name-templates')).toBeVisible()
  await expect(editor.getByPlaceholder('Snippet name…')).toHaveValue('Example — M')
})
