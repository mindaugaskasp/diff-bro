import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  openMenu,
  stubSaveDialog,
  stubOpenDialog
} from './fixtures.mjs'

// Sharing is the highest-stakes flow: exchange public keys, seal a diff for one
// recipient, and import it on the other side. The crypto core (seal/open,
// tamper, recipient-binding, TTL) is unit-tested; these guard the whole UX
// wiring across TWO real identities — export, add-trusted, the recipient picker,
// the sealed-file write, and import — which only two live apps can exercise.

// Export this app's public key to `path` via the (stubbed) save dialog. Saving
// closes the dialog itself, so no explicit Close is needed.
async function exportKey(app, page, name, path) {
  await stubSaveDialog(app, path)
  await openMenu(page, 'Security', 'Share My Public Key')
  const dlg = page.getByRole('dialog', { name: 'Share my public key' })
  await dlg.getByLabel('Name others will see').fill(name)
  await dlg.getByRole('button', { name: /Save to file/ }).click()
  await expect(page.getByText(/public key was saved/i)).toBeVisible()
  await expect(dlg).toBeHidden()
}

// Import a peer's key file and commit it under its prefilled name.
async function addTrusted(app, page, keyPath) {
  await stubOpenDialog(app, keyPath)
  await openMenu(page, 'Security', 'Add Trusted Key')
  const add = page.getByRole('dialog', { name: 'Add trusted key' })
  await expect(add).toBeVisible()
  await add.getByRole('button', { name: 'Add', exact: true }).click()
  // The manager opens once stored; close it (footer button, not the × — both
  // are named "Close").
  const mgr = page.getByRole('dialog', { name: 'Trusted keys' })
  await expect(mgr).toBeVisible()
  await mgr.locator('.dialog-actions button', { hasText: 'Close' }).click()
}

test('two peers exchange keys, share a sealed diff, and import it', async () => {
  test.setTimeout(120_000) // two Electron instances + a full key-exchange flow
  const exchange = mkdtempSync(join(tmpdir(), 'diffbro-exchange-'))
  const dirA = freshUserDataDir()
  const dirB = freshUserDataDir()
  const appA = await launchApp(dirA)
  const pageA = await firstReadyPage(appA)
  const appB = await launchApp(dirB)
  const pageB = await firstReadyPage(appB)
  const keyA = join(exchange, 'alice.diffbrokey')
  const keyB = join(exchange, 'bob.diffbrokey')
  try {
    // 1. Both export their public keys.
    await exportKey(appA, pageA, 'Alice', keyA)
    await exportKey(appB, pageB, 'Bob', keyB)

    // 2. Each trusts the other's key (the exchange must go both ways).
    await addTrusted(appA, pageA, keyB)
    await addTrusted(appB, pageB, keyA)

    // 3. Alice makes a diff, saves it, and shares it — Bob is the only recipient.
    await pageA.getByRole('button', { name: 'Paste text' }).click()
    await pageA.getByPlaceholder('Paste original text here').fill('release v1')
    await pageA.getByPlaceholder('Paste changed text here').fill('release v2')
    await pageA.getByRole('button', { name: 'Compare', exact: true }).click()

    await pageA.getByRole('button', { name: 'Save', exact: true }).click()
    const saveDlg = pageA.getByRole('dialog', { name: 'Save diff' })
    await saveDlg.getByLabel('Name').fill('Shared work')
    await saveDlg.getByRole('button', { name: 'Save', exact: true }).click()

    const row = pageA.locator('.diff', { hasText: 'Shared work' })
    await expect(row).toBeVisible()
    await stubSaveDialog(appA, join(exchange, 'sealed-placeholder'))
    await row.getByTitle('Share as sealed file').click()
    const shareDlg = pageA.getByRole('dialog', { name: 'Share diff' })
    await expect(shareDlg).toBeVisible()
    await shareDlg.getByRole('button', { name: 'Create file' }).click()
    await expect(pageA.getByText(/Sealed shared diff/i)).toBeVisible()

    // The sealed file has a forced, hashed name — find it in the exchange dir.
    const sealed = readdirSync(exchange).find((f) => f.endsWith('.diffbro'))
    expect(sealed).toBeTruthy()

    // 4. Bob imports it — it lands in External diffs, credited to Alice.
    const external = pageB.locator('.sidebar-section', { hasText: 'External diffs' })
    const externalHelp = external.getByText(/Sealed diffs others share with you land here/)
    await expect(externalHelp).toBeVisible() // empty-state help, before any import
    await stubOpenDialog(appB, join(exchange, sealed))
    await pageB.getByRole('button', { name: /Import a shared diff/ }).click()
    // Bob has nothing on screen, so the import opens the diff straight away
    // ("Opened…"); with a diff already active it would keep the view instead.
    await expect(pageB.getByText(/Opened "Shared work" from Alice/)).toBeVisible()
    await expect(external.getByText('Shared work')).toBeVisible()
    await expect(externalHelp).toBeHidden() // the help text clears once a diff is there

    // 5. Manage trusted keys on Alice: rename Bob, then remove him.
    await openMenu(pageA, 'Security', 'Manage Trusted Keys')
    const mgr = pageA.getByRole('dialog', { name: 'Trusted keys' })
    await expect(mgr.getByText('Bob', { exact: true })).toBeVisible()
    await mgr.getByTitle('Rename').click()
    await mgr.locator('input.rename').fill('Bob — laptop')
    await mgr.locator('input.rename').press('Enter')
    await expect(mgr.getByText('Bob — laptop')).toBeVisible()
    await mgr.getByTitle('Remove').click()
    await expect(mgr.getByText(/No trusted keys yet/i)).toBeVisible()
  } finally {
    await appA.close()
    await appB.close()
    rmSync(dirA, { recursive: true, force: true })
    rmSync(dirB, { recursive: true, force: true })
    rmSync(exchange, { recursive: true, force: true })
  }
})

test('adding your own key is refused', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-ownkey-'))
  const keyPath = join(dir, 'me.diffbrokey')
  try {
    await stubSaveDialog(app, keyPath)
    await openMenu(page, 'Security', 'Share My Public Key')
    const dlg = page.getByRole('dialog', { name: 'Share my public key' })
    await dlg.getByRole('button', { name: /Save to file/ }).click()
    await expect(page.getByText(/public key was saved/i)).toBeVisible()

    await stubOpenDialog(app, keyPath)
    await openMenu(page, 'Security', 'Add Trusted Key')
    await expect(page.getByText(/your own public key/i)).toBeVisible()
    // No naming dialog opened.
    await expect(page.getByRole('dialog', { name: 'Add trusted key' })).toBeHidden()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a file that is not a public key is rejected', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-badkey-'))
  const bad = join(dir, 'bad.diffbrokey')
  writeFileSync(bad, 'this is not a key')
  try {
    await stubOpenDialog(app, bad)
    await openMenu(page, 'Security', 'Add Trusted Key')
    await expect(page.getByText(/not a valid public key/i)).toBeVisible()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
