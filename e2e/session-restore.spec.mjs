import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  openMenu,
  openSettings
} from './fixtures.mjs'

// Closing the app must not throw away what was open. Only a real launch proves
// it: the session is sealed with the vault key in the main process, written to
// the data directory, and read back before the window accepts anything else —
// none of which exists in jsdom. These manage their own relaunch against one
// profile rather than using the per-test `app` fixture.

const tabs = (page) => page.locator('.diff-tabs .tab')
const inDiff = (page, text) => page.locator('.diff-container').getByText(text)
const reopenToggle = (page) =>
  page.getByRole('checkbox', { name: 'Reopen the comparisons that were open when I quit' })
const addTab = (page) =>
  page.locator('.diff-tabs').getByRole('button', { name: 'New comparison', exact: true })

async function compare(page, left, right) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()
}

// The write is debounced, so wait for it to land on disk rather than for a
// duration — closing mid-debounce would test the timing, not the feature.
async function sessionOnDisk(userDataDir) {
  const path = join(userDataDir, 'session.json')
  await expect
    .poll(() => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')).data?.length : 0), {
      timeout: 5000
    })
    .toBeGreaterThan(0)
  return readFileSync(path, 'utf-8')
}

test('the comparisons that were open come back after a quit', async () => {
  const userDataDir = freshUserDataDir()
  try {
    let app = await launchApp(userDataDir)
    let page = await firstReadyPage(app)

    await compare(page, 'first-left', 'first-right')
    await addTab(page).click()
    await compare(page, 'second-left', 'second-right')
    await tabs(page).first().click()
    await expect(inDiff(page, 'first-left').first()).toBeVisible()

    // Sealed with the vault key: the pasted text is not in the file.
    const raw = await sessionOnDisk(userDataDir)
    expect(raw).not.toContain('second-left')
    await app.close()

    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)

    await expect(tabs(page)).toHaveCount(2)
    // The tab that was in front is the one on screen.
    await expect(inDiff(page, 'first-left').first()).toBeVisible()
    await expect(inDiff(page, 'second-left')).toHaveCount(0)
    // And the other one still holds its own comparison.
    await tabs(page).nth(1).click()
    await expect(inDiff(page, 'second-left').first()).toBeVisible()
    await app.close()
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('turning the setting off forgets the session and stops storing one', async () => {
  const userDataDir = freshUserDataDir()
  try {
    let app = await launchApp(userDataDir)
    let page = await firstReadyPage(app)

    await compare(page, 'private-left', 'private-right')
    await sessionOnDisk(userDataDir)

    await openSettings(page)
    await page.getByRole('button', { name: 'Storage', exact: true }).click()
    await reopenToggle(page).click()
    // Off forgets what was already stored, rather than only skipping the next write.
    await expect
      .poll(() => JSON.parse(readFileSync(join(userDataDir, 'session.json'), 'utf-8')).data)
      .toBeUndefined()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()

    // Still nothing stored as work continues.
    await compare(page, 'more-left', 'more-right')
    await expect
      .poll(() => readFileSync(join(userDataDir, 'session.json'), 'utf-8'))
      .not.toContain('data')
    await app.close()

    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    await expect(page.getByText('Choose or drop two files to compare')).toBeVisible()
    // And the choice itself survived the quit.
    await openSettings(page)
    await page.getByRole('button', { name: 'Storage', exact: true }).click()
    await expect(reopenToggle(page)).not.toBeChecked()
    await app.close()
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('closing the last comparison leaves the next launch empty', async () => {
  const userDataDir = freshUserDataDir()
  try {
    let app = await launchApp(userDataDir)
    let page = await firstReadyPage(app)

    await compare(page, 'transient', 'TRANSIENT')
    await sessionOnDisk(userDataDir)

    // Clearing it is a decision, and it has to outlive the quit too.
    await openMenu(page, 'Edit', 'Clear')
    await expect(page.getByText('Choose or drop two files to compare')).toBeVisible()
    await expect
      .poll(() => JSON.parse(readFileSync(join(userDataDir, 'session.json'), 'utf-8')).data)
      .toBeUndefined()
    await app.close()

    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    await expect(page.getByText('Choose or drop two files to compare')).toBeVisible()
    await expect(tabs(page)).toHaveCount(1)
    await app.close()
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
