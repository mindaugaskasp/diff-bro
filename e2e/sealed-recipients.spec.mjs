import { test, expect, openMenu, stubSaveDialog } from './fixtures.mjs'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The record is written only when a sealed file is actually on disk, and it has
// to reach the store file so the answer is still there next launch. Both need a
// real seal through the real IPC, which is not something jsdom can stand in for.

const PEER = 'Peer — laptop'

// A recipient to seal for. The keypair is built HERE, in the test process,
// rather than through the app — an independent implementation of the key shape
// is worth more in a test than a mirror of the one under test. The renderer
// then imports it exactly as a .diffbrokey would.
function peerKey() {
  const pem = (k) => k.export({ type: 'spki', format: 'pem' })
  return {
    format: 'diffbro-key/2',
    sign: pem(generateKeyPairSync('ed25519').publicKey),
    box: pem(generateKeyPairSync('x25519').publicKey)
  }
}

const trustAPeer = (page, label) =>
  page.evaluate(
    async ({ key, label }) => (await window.api.addTrustedKeyNamed(key, label))?.fingerprint,
    { key: peerKey(), label }
  )

async function saveAndSeal(page, name) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill('before')
  await page.getByPlaceholder('Paste changed text here').fill('after')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const save = page.getByRole('dialog', { name: 'Save diff' })
  await save.getByLabel('Name', { exact: true }).fill(name)
  await save.getByRole('button', { name: 'Save', exact: true }).click()

  const row = page.locator('li.diff', { hasText: name })
  await expect(row).toBeVisible()
  await row.hover()
  await row.getByRole('button', { name: 'Share as sealed file' }).click()

  const picker = page.getByRole('dialog', { name: 'Share diff' })
  // The row is a <label> wrapping a checkbox — clicking the text alone left
  // "Create file" disabled, because nothing was selected.
  await picker.locator('.recipient', { hasText: PEER }).locator('input[type=checkbox]').check()
  await picker.getByRole('button', { name: 'Create file' }).click()
  await expect(picker).toHaveCount(0)
}

test('removing a trusted key shows what has already been sealed for it', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-sealed-'))
  try {
    const fp = await trustAPeer(page, PEER)
    expect(fp).toMatch(/^[0-9a-f]{32}$/)

    await stubSaveDialog(app, join(dir, 'sealed.diffbro'))
    await saveAndSeal(page, 'E2E exposure')

    await openMenu(page, 'Security', 'Manage Trusted Keys')
    const manager = page.getByRole('dialog', { name: 'Trusted keys' })
    await manager.locator('li', { hasText: PEER }).getByRole('button', { name: 'Remove' }).click()

    const confirm = page.getByRole('dialog', { name: 'Remove trusted key?' })
    await expect(confirm).toBeVisible()
    // The diff is named, so the reader sees their exposure while deciding…
    await expect(confirm).toContainText('E2E exposure')
    // …and the copy is honest that removing the key does not reach it.
    await expect(confirm).toContainText(/already on the other machine/i)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Cancelling the save dialog writes no file, so nothing was shared — and the
// dialog must not claim otherwise.
test('a cancelled seal leaves no record behind', async ({ app, page }) => {
  await trustAPeer(page, PEER)
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true })
  })
  await saveAndSeal(page, 'E2E cancelled')

  await openMenu(page, 'Security', 'Manage Trusted Keys')
  const manager = page.getByRole('dialog', { name: 'Trusted keys' })
  await manager.locator('li', { hasText: PEER }).getByRole('button', { name: 'Remove' }).click()

  const confirm = page.getByRole('dialog', { name: 'Remove trusted key?' })
  await expect(confirm).toBeVisible()
  await expect(confirm).not.toContainText('E2E cancelled')
  await expect(confirm).not.toContainText(/have sealed/i)
})
