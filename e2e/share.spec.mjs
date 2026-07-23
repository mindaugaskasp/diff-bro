import { test, expect } from './fixtures.mjs'

// Sharing seals a diff for one recipient. The full sealed-file roundtrip needs
// native save/open dialogs and a second identity, and is already covered by the
// crypto unit tests (sealing roundtrip/tamper/binding). What only a real launch
// exercises — and what this guards — is the two-step share UX and the on-demand
// identity-key creation: Share must save first (a share file needs a name and
// expiry), then, with no trusted keys yet, drop into the one-time key-exchange
// setup instead of a recipient picker. Rendering that dialog asks the main
// process for this install's fingerprint, which creates its keypair in
// safeStorage — a path jsdom can't reach.
test('sharing with no trusted keys walks through first-time key setup', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('before')
  await page.getByPlaceholder('Paste changed text here').fill('after')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()

  // Step 1: Share reuses the save dialog to name and time-box the diff.
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const save = page.getByRole('dialog', { name: 'Share diff — step 1 of 2: save it' })
  await expect(save).toBeVisible()
  await save.getByRole('button', { name: 'Next: choose recipient' }).click()

  // Step 2: no trusted keys → the one-time setup, not the recipient picker.
  const setup = page.getByRole('dialog', { name: 'Share diff — one-time setup' })
  await expect(setup).toBeVisible()
  // Exact: each step's heading text is a substring of its action button's label
  // ("Add their key" vs the "Add their key…" button).
  await expect(setup.getByText('Give them your key', { exact: true })).toBeVisible()
  await expect(setup.getByText('Add their key', { exact: true })).toBeVisible()
})
