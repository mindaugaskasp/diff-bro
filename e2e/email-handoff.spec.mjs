import { generateKeyPairSync } from 'node:crypto'
import { KEY_FORMAT, decodePublicKey, encodePublicKey, fingerprint } from '../src/main/sealing.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  stubSaveDialog
} from './fixtures.mjs'

// The hand-off only exists across the IPC boundary: main seals the file, builds
// the mailto:, confirms, and hands both to the OS. Nothing about it is visible
// from the renderer, which is the point — it supplies fingerprints and text, and
// never a path or a URL.
//
// shell.openExternal / showItemInFolder are patched in the MAIN process, so no
// mail draft or Finder window opens on the machine running this.
async function captureOsCalls(app) {
  await app.evaluate(({ shell, dialog }) => {
    globalThis.__opened = []
    globalThis.__revealed = []
    shell.openExternal = async (url) => {
      globalThis.__opened.push(url)
    }
    shell.showItemInFolder = (path) => {
      globalThis.__revealed.push(path)
    }
    // Confirm the hand-off; a spec that needs the cancel path re-stubs this.
    dialog.showMessageBox = async () => ({ response: 0 })
  })
}

const osCalls = (app) =>
  app.evaluate(() => ({
    opened: globalThis.__opened ?? [],
    revealed: globalThis.__revealed ?? []
  }))

// REAL key material. The hand-off seals for these fingerprints, so placeholder
// sign/box makes createPublicKey throw and every later assertion vacuous — the
// trusted-key MANAGER never seals, which is why its spec can get away with it.
const realKey = () => {
  const sign = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' })
  const box = generateKeyPairSync('x25519').publicKey.export({ type: 'spki', format: 'pem' })
  return { sign, box }
}

// The fingerprint has to be the one sealing recomputes. The spec runs in Node,
// so it imports sealing.js directly — `await import()` inside app.evaluate
// throws, because the bundled main has no module registry to resolve against.
const seedKeys = (dir, entries) =>
  writeFileSync(
    join(dir, 'trusted-keys.json'),
    JSON.stringify(
      entries.map((e) => {
        const { sign, box } = realKey()
        return { sign, box, fingerprint: fingerprint(sign, box), ...e }
      })
    )
  )

async function compareAndShare(page) {
  const left = page.getByPlaceholder('Paste original text here')
  if (!(await left.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Paste mode' }).click()
  }
  await left.fill('before')
  await page.getByPlaceholder('Paste changed text here').fill('after')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  // The toolbar Share saves FIRST — SaveDiffDialog retitles itself for the
  // two-step flow (SaveDiffDialog.vue:86,90).
  const save = page.getByRole('dialog', { name: 'Share diff — step 1 of 2: save it' })
  await save.getByLabel('Name').fill('E2E email diff')
  await save.getByRole('button', { name: 'Next: choose recipient' }).click()
  return page.getByRole('dialog', { name: 'Share diff', exact: true })
}

test('email hand-off opens an addressed mailto: and reveals the file it sealed', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  seedKeys(dir, [{ label: 'Ana', email: 'ana@example.com' }])
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)

  try {
    await captureOsCalls(app)
    const sealedPath = join(dir, 'sealed.diffbro')
    await stubSaveDialog(app, sealedPath)

    const share = await compareAndShare(page)
    await expect(share).toBeVisible()
    await share.getByRole('checkbox').first().check()

    await share.getByRole('button', { name: 'Email this diff' }).click()
    const compose = page.getByRole('dialog', { name: 'Email this diff' })
    await expect(compose).toBeVisible()
    // The address is rendered from the trusted key, not typed.
    await expect(compose.getByText('ana@example.com')).toBeVisible()

    await compose.getByRole('button', { name: 'Create & open mail' }).click()
    await expect(compose).toBeHidden()

    const { opened, revealed } = await osCalls(app)
    expect(opened).toHaveLength(1)
    const url = new URL(opened[0])
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('ana@example.com')
    expect([...url.searchParams.keys()]).not.toContain('attach')

    // The revealed path is the one main sealed — never round-tripped through the
    // renderer — and it is a real sealed file.
    expect(revealed).toHaveLength(1)
    const file = JSON.parse(readFileSync(revealed[0], 'utf-8'))
    expect(file.ciphertext).toBeTruthy()
    expect(JSON.stringify(file)).not.toContain('before')
  } finally {
    await app.close()
  }
})

test('cancelling the confirm opens nothing but keeps the sealed file', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  seedKeys(dir, [{ label: 'Ana', email: 'ana@example.com' }])
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)

  try {
    await captureOsCalls(app)
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 })
    })
    await stubSaveDialog(app, join(dir, 'cancelled.diffbro'))

    const share = await compareAndShare(page)
    await share.getByRole('checkbox').first().check()
    await share.getByRole('button', { name: 'Email this diff' }).click()
    await page
      .getByRole('dialog', { name: 'Email this diff' })
      .getByRole('button', { name: 'Create & open mail' })
      .click()

    const { opened, revealed } = await osCalls(app)
    expect(opened).toEqual([])
    expect(revealed).toEqual([])
  } finally {
    await app.close()
  }
})

test('a recipient with no address is not offered the email route', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  seedKeys(dir, [{ label: 'Tomas' }]) // no email
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)

  try {
    await captureOsCalls(app)
    await stubSaveDialog(app, join(dir, 'nomail.diffbro'))
    const share = await compareAndShare(page)
    await share.getByRole('checkbox').first().check()

    await expect(share.getByRole('button', { name: 'Email this diff' })).toHaveCount(0)
    await expect(share.getByRole('button', { name: 'Create file' })).toBeVisible()
    await expect(share.getByText('no address')).toBeVisible()
  } finally {
    await app.close()
  }
})

// ui.css `.dialog label` sets `flex-direction: column` for every label in a
// dialog, so a recipient row that only declares `display: flex` stacks its
// checkbox above the name and centres both — which is what shipped. The
// invariant is a MEASUREMENT: the checkbox and the name share a line.
test('a recipient row lays out as a row, not a column', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  seedKeys(dir, [
    { label: 'Ana — work laptop', email: 'ana@example.com' },
    { label: 'Tomas — build box' }
  ])
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)

  try {
    await captureOsCalls(app)
    await stubSaveDialog(app, join(dir, 'layout.diffbro'))
    const share = await compareAndShare(page)
    await expect(share).toBeVisible()

    const row = share.locator('.recipient').first()
    const box = await row.boundingBox()
    const check = await row.locator('input[type="checkbox"]').boundingBox()
    const name = await row.locator('.rc-name').boundingBox()

    // Same line: their vertical centres agree.
    const centre = (b) => b.y + b.height / 2
    expect(Math.abs(centre(check) - centre(name))).toBeLessThanOrEqual(3)
    // The checkbox leads; the name does not sit under it.
    expect(check.x + check.width).toBeLessThanOrEqual(name.x + 1)
    // One line tall, not three (--control-h-sm is 26px).
    expect(box.height).toBeLessThan(44)

    // The address sits at the end of the same line, not beneath the name.
    const mail = await row.locator('.rc-mail').boundingBox()
    expect(Math.abs(centre(mail) - centre(name))).toBeLessThanOrEqual(3)
    expect(mail.x).toBeGreaterThan(name.x)

    // Eight rows fit the capped region, so a 30-key list cannot push the
    // actions off screen.
    await expect(share.getByRole('button', { name: 'Create file' })).toBeVisible()
  } finally {
    await app.close()
  }
})

// Filtering and ticking both changed the dialog's height, which is jarring
// under the pointer. Both regions are height-reserved now; the invariant is a
// measurement, not a screenshot.
test('the dialog does not resize while picking or filtering', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  seedKeys(
    dir,
    Array.from({ length: 20 }, (_, i) => ({
      label: `Teammate ${String(i + 1).padStart(2, '0')}`,
      email: `teammate${i + 1}@example.com`
    }))
  )
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)

  try {
    await captureOsCalls(app)
    await stubSaveDialog(app, join(dir, 'steady.diffbro'))
    const share = await compareAndShare(page)
    await expect(share).toBeVisible()

    const height = async () => (await share.boundingBox()).height
    const opened = await height()

    // Ticking the first recipient adds the chips row.
    await share.getByRole('checkbox').first().check()
    expect(Math.abs((await height()) - opened)).toBeLessThanOrEqual(1)

    // And several more, which used to wrap the chips onto a second row and grow
    // the dialog anyway — the same jump, just later.
    for (const i of [1, 2, 3, 4]) {
      await share.getByRole('checkbox').nth(i).check()
    }
    await expect(share.locator('.picked .chip')).toHaveCount(5)
    expect(Math.abs((await height()) - opened)).toBeLessThanOrEqual(1)

    // Filtering twenty keys down to one empties most of the list.
    const box = share.getByRole('searchbox', { name: 'Search recipients' })
    await box.fill('Teammate 07')
    await expect(share.locator('.recipients li')).toHaveCount(1)
    expect(Math.abs((await height()) - opened)).toBeLessThanOrEqual(1)

    // And a query that matches nothing at all.
    await box.fill('zzzz')
    await expect(share.locator('.recipients li')).toHaveCount(0)
    expect(Math.abs((await height()) - opened)).toBeLessThanOrEqual(1)

    await box.fill('')
    expect(Math.abs((await height()) - opened)).toBeLessThanOrEqual(1)
  } finally {
    await app.close()
  }
})

// The scale case: thirty keys must not push the dialog's actions off the screen,
// and — the regression the picker's whole two-region design exists to prevent —
// a filter must never drop a recipient you already ticked.
test('the picker holds thirty keys and a filter cannot hide a selection', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  seedKeys(
    dir,
    Array.from({ length: 30 }, (_, i) => ({
      label: `Teammate ${String(i + 1).padStart(2, '0')}`,
      email: `teammate${i + 1}@example.com`
    }))
  )
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)

  try {
    await captureOsCalls(app)
    await stubSaveDialog(app, join(dir, 'many.diffbro'))
    const share = await compareAndShare(page)
    await expect(share).toBeVisible()

    // The dialog fits the window: jsdom cannot assert this, a real launch can.
    const box = await share.boundingBox()
    const viewport =
      page.viewportSize() ??
      (await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      })))
    expect(box.height).toBeLessThan(viewport.height)
    await expect(share.getByRole('button', { name: 'Create file' })).toBeVisible()

    await share.getByRole('checkbox').first().check()
    await expect(share.locator('.picked .chip')).toHaveCount(1)

    // Filter to something that excludes the ticked row.
    await share.getByRole('searchbox', { name: 'Search recipients' }).fill('Teammate 29')
    await expect(share.locator('.recipients li')).toHaveCount(1)
    // Still ticked, still on screen, still the answer.
    await expect(share.locator('.picked .chip')).toHaveCount(1)
    await expect(share.locator('.picked .chip').first()).toContainText('Teammate 01')
  } finally {
    await app.close()
  }
})

// ——— The key swap's own hand-offs (specs/2026-08-09-email-my-key) ———

test('Email it opens an UNADDRESSED draft carrying the fingerprint, key staged for pasting', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)

  try {
    await captureOsCalls(app)
    await page.getByRole('button', { name: 'My key' }).click()
    const dialog = page.getByRole('dialog', { name: 'Share my public key' })
    await dialog.getByPlaceholder('e.g. Alice — laptop').fill('E2E mailer')
    const shownFp = (await dialog.locator('.fp code').innerText()).trim()

    await dialog.getByRole('button', { name: 'Email it' }).click()
    await expect(dialog).toBeHidden()

    const { opened, revealed } = await osCalls(app)
    expect(opened).toHaveLength(1)
    const url = new URL(opened[0])
    expect(url.protocol).toBe('mailto:')
    // No addressee — the key goes to someone not yet in the trust store.
    expect(url.pathname).toBe('')
    expect(url.searchParams.get('body')).toContain(shownFp)
    expect([...url.searchParams.keys()]).not.toContain('attach')

    // The revealed path is the STAGED key file main wrote — a real, parseable
    // public key whose material matches the fingerprint the dialog showed.
    expect(revealed).toHaveLength(1)
    const key = decodePublicKey(readFileSync(revealed[0], 'utf-8'))
    expect(fingerprint(key.sign, key.box)).toBe(shownFp)
  } finally {
    await app.close()
  }
})

// A key that arrived through a chat app is text on the clipboard. It must be
// OFFERED through the same naming dialog a picked file gets — never silently
// added — and junk must fall through to the picker without a word.
test('a clipboard key is offered for verification; junk falls through to the picker', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)

  try {
    await app.evaluate(({ dialog }) => {
      globalThis.__pickers = 0
      dialog.showOpenDialog = async () => {
        globalThis.__pickers++
        return { canceled: true, filePaths: [] }
      }
    })

    // Junk on the clipboard: straight to the picker, no dialog, no notice.
    await app.evaluate(({ clipboard }) => clipboard.writeText('not a key at all'))
    await page.getByRole('button', { name: 'Trusted key' }).click()
    await expect(page.getByRole('dialog', { name: 'Add Trusted Key' })).toHaveCount(0)
    expect(await app.evaluate(() => globalThis.__pickers)).toBe(1)

    // A real key, wrapped the way Slack pastes it.
    const peer = realKey()
    const text =
      '```\n' + encodePublicKey({ ...peer, format: KEY_FORMAT, label: 'Rūta phone' }) + '\n```'
    await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), text)
    await page.getByRole('button', { name: 'Trusted key' }).click()

    const confirm = page.getByRole('dialog', { name: 'Add Trusted Key' })
    await expect(confirm).toBeVisible()
    await expect(confirm.getByText('Read from your clipboard')).toBeVisible()
    // The fingerprint shown is RECOMPUTED from the material.
    await expect(confirm.locator('code').first()).toHaveText(fingerprint(peer.sign, peer.box))

    // The way out: Choose a file instead skips the peek and opens the picker.
    await confirm.getByRole('button', { name: 'Choose a file instead…' }).click()
    await expect(confirm).toBeHidden()
    expect(await app.evaluate(() => globalThis.__pickers)).toBe(2)

    // Round two, this time trusting it: the name field prefills from the key's
    // own label and Add lands it in the sidebar's trusted keys.
    await page.getByRole('button', { name: 'Trusted key' }).click()
    await expect(confirm).toBeVisible()
    await expect(confirm.getByPlaceholder('e.g. Alice — laptop')).toHaveValue('Rūta phone')
    await confirm.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(confirm).toBeHidden()

    const stored = JSON.parse(readFileSync(join(dir, 'trusted-keys.json'), 'utf-8'))
    expect(stored).toHaveLength(1)
    expect(stored[0].fingerprint).toBe(fingerprint(peer.sign, peer.box))
    expect(stored[0].label).toBe('Rūta phone')
  } finally {
    await app.close()
  }
})
