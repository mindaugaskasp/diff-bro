import {
  test,
  expect,
  openMenu,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  stubSaveDialog,
  stubOpenDialog
} from './fixtures.mjs'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Rotation only means anything across a real identity store: the old private
// key has to survive in userData as decrypt-only, and the new one has to be
// what gets signed with. Neither is observable without launching the app.

const fingerprintOf = (page) => page.evaluate(() => window.api.myFingerprint())

test('replacing the key changes the fingerprint and keeps the old one for reading', async ({
  page
}) => {
  const before = await fingerprintOf(page)
  expect(before).toMatch(/^[0-9a-f]{32}$/)
  expect(await page.evaluate(() => window.api.retiredKeyCount())).toBe(0)

  await openMenu(page, 'Security', 'Replace My Key…')
  const dialog = page.getByRole('dialog', { name: 'Replace my key' })
  await expect(dialog).toBeVisible()

  // The copy has to say the thing people get wrong: this cannot un-send.
  await expect(dialog).toContainText(/cannot take anything back/i)

  await dialog.getByRole('button', { name: 'Replace my key' }).click()
  await expect(dialog).toContainText(/new fingerprint/i)

  const after = await fingerprintOf(page)
  expect(after).toMatch(/^[0-9a-f]{32}$/)
  expect(after).not.toBe(before)
  // The old key is retired, not destroyed — a diff already sealed to it still
  // has a key on this machine that can read it.
  expect(await page.evaluate(() => window.api.retiredKeyCount())).toBe(1)
})

test('destroying the retired keys is a second, deliberate step', async ({ page }) => {
  await openMenu(page, 'Security', 'Replace My Key…')
  const dialog = page.getByRole('dialog', { name: 'Replace my key' })
  await dialog.getByRole('button', { name: 'Replace my key' }).click()
  await expect(dialog).toContainText(/new fingerprint/i)

  // Guarded behind its own acknowledgement, never folded into the rotation.
  const destroy = dialog.getByRole('button', { name: /Destroy old key/ })
  await expect(destroy).toBeDisabled()
  await dialog.getByRole('checkbox').check()
  await expect(destroy).toBeEnabled()
  await destroy.click()

  await expect.poll(() => page.evaluate(() => window.api.retiredKeyCount())).toBe(0)
})

// The invariant the two tests above do NOT reach. Both assert retiredKeyCount(),
// which only proves a file exists — swap decryptionIdentities() (share.js) for
// `[await getIdentity()]` and the count is still 1, both tests stay green, and
// every diff already sealed to the pre-rotation key becomes permanently
// unreadable. The standards call that out by name: "never let rotation destroy
// it silently, which would orphan unopened diffs."
//
// Reaching it takes two profiles, because you cannot seal to yourself: the
// SENDER holds a key the opener does not. Alice seals for Bob, Bob rotates, and
// Bob must still be able to read what was already on its way to him.
test('a diff sealed before rotation still opens after it', async () => {
  test.setTimeout(120_000)
  const work = mkdtempSync(join(tmpdir(), 'diffbro-rotate-'))
  const bobDir = freshUserDataDir()
  const aliceDir = freshUserDataDir()

  try {
    // --- Bob: publish his public key, then close so Alice can seal for it.
    let bob = await launchApp(bobDir)
    let bobPage = await firstReadyPage(bob)
    await bobPage.evaluate(() => window.api.copyPublicKey('Bob'))
    const envelope = await bob.evaluate(({ clipboard }) => clipboard.readText())
    expect(envelope).toMatch(/^dbk1:/)
    // Decoded HERE rather than through the app, so the test does not depend on
    // the encoder it is exercising. addTrustedKeyNamed takes the parsed shape.
    const bobKey = JSON.parse(Buffer.from(envelope.slice('dbk1:'.length), 'base64').toString())
    await bob.close()

    // --- Alice: trust Bob, save a diff, seal it for him.
    const alice = await launchApp(aliceDir)
    const alicePage = await firstReadyPage(alice)
    const fp = await alicePage.evaluate(
      async (key) => (await window.api.addTrustedKeyNamed(key, 'Bob'))?.fingerprint,
      bobKey
    )
    expect(fp).toMatch(/^[0-9a-f]{32}$/)

    await alicePage.getByRole('button', { name: 'Paste mode' }).click()
    await alicePage.getByPlaceholder('Paste original text here').fill('before rotation')
    await alicePage.getByPlaceholder('Paste changed text here').fill('after rotation')
    await alicePage.getByRole('button', { name: 'Compare', exact: true }).click()
    await alicePage.getByRole('button', { name: 'Save', exact: true }).click()
    const save = alicePage.getByRole('dialog', { name: 'Save diff' })
    await save.getByLabel('Name', { exact: true }).fill('Sealed before rotation')
    await save.getByRole('button', { name: 'Save', exact: true }).click()

    // The save dialog only picks the DIRECTORY: shareExport forces the filename
    // to a ciphertext hash, so the sealed file is found rather than named.
    await stubSaveDialog(alice, join(work, 'ignored.diffbro'))
    const row = alicePage.locator('li.diff', { hasText: 'Sealed before rotation' })
    await expect(row).toBeVisible()
    await row.hover()
    await row.getByRole('button', { name: 'Share as sealed file' }).click()
    const picker = alicePage.getByRole('dialog', { name: 'Share diff' })
    await picker.locator('.recipient', { hasText: 'Bob' }).locator('input[type=checkbox]').check()
    await picker.getByRole('button', { name: 'Create file' }).click()
    await expect(picker).toHaveCount(0)
    await expect
      .poll(() => readdirSync(work).filter((f) => f.endsWith('.diffbro')).length, {
        message: 'Alice must have written a sealed file'
      })
      .toBe(1)
    const sealed = join(
      work,
      readdirSync(work).find((f) => f.endsWith('.diffbro'))
    )

    // Bob has to trust Alice to accept her signature — otherwise the import
    // stops at unknown-signer, which would hide whether the decrypt worked.
    await alicePage.evaluate(() => window.api.copyPublicKey('Alice'))
    const aliceEnvelope = await alice.evaluate(({ clipboard }) => clipboard.readText())
    const aliceKey = JSON.parse(
      Buffer.from(aliceEnvelope.slice('dbk1:'.length), 'base64').toString()
    )
    await alice.close()

    // --- Bob: rotate, THEN open what was sealed to the old key.
    bob = await launchApp(bobDir)
    bobPage = await firstReadyPage(bob)
    const beforeFp = await bobPage.evaluate(() => window.api.myFingerprint())

    await openMenu(bobPage, 'Security', 'Replace My Key…')
    const dialog = bobPage.getByRole('dialog', { name: 'Replace my key' })
    await dialog.getByRole('button', { name: 'Replace my key' }).click()
    await expect(dialog).toContainText(/new fingerprint/i)
    await bobPage.keyboard.press('Escape')
    expect(await bobPage.evaluate(() => window.api.myFingerprint())).not.toBe(beforeFp)

    await bobPage.evaluate(async (key) => window.api.addTrustedKeyNamed(key, 'Alice'), aliceKey)

    // The whole point: the retired key is still in the decrypt set.
    await stubOpenDialog(bob, [sealed])
    const opened = await bobPage.evaluate(() => window.api.shareImport())
    expect(opened.error, `rotation orphaned the diff: ${opened.error}`).toBeUndefined()
    expect(opened.entry?.name ?? opened.name).toContain('Sealed before rotation')
    await bob.close()
  } finally {
    rmSync(work, { recursive: true, force: true })
    rmSync(bobDir, { recursive: true, force: true })
    rmSync(aliceDir, { recursive: true, force: true })
  }
})
