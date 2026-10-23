import { test, expect, openNewSnippet } from './fixtures.mjs'

async function announceUpdate(app, version) {
  await app.evaluate(({ BrowserWindow }, v) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('app:updated', v)
  }, version)
}

async function stubRelaunch(app) {
  await app.evaluate(({ ipcMain }) => {
    globalThis.relaunches = 0
    ipcMain.removeHandler('app:relaunch')
    ipcMain.handle('app:relaunch', () => globalThis.relaunches++)
  })
}

const relaunches = (app) => app.evaluate(() => globalThis.relaunches)

test('a replaced bundle offers a restart onto the new build', async ({ app, page }) => {
  await stubRelaunch(app)
  await announceUpdate(app, '9.9.9')
  const notice = page.locator('.update-notice')
  await expect(notice).toContainText('v9.9.9')

  await notice.getByRole('button', { name: 'Restart' }).click()
  await expect.poll(() => relaunches(app)).toBe(1)
})

test('restart waits for an unsaved snippet', async ({ app, page }) => {
  await stubRelaunch(app)
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New Snippet' })
  await doc.locator('.editor').click()
  await page.keyboard.type('unsaved work')

  await announceUpdate(app, '9.9.9')
  const notice = page.locator('.update-notice')
  await notice.getByRole('button', { name: 'Restart' }).click()
  await expect(notice).toContainText('Save or discard this snippet first')
  await expect(doc).toBeVisible()
  expect(await relaunches(app)).toBe(0)
})

test('the update notice can be dismissed', async ({ app, page }) => {
  await announceUpdate(app, '9.9.9')
  const notice = page.locator('.update-notice')
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'Dismiss the update notice' }).click()
  await expect(notice).toBeHidden()
})
