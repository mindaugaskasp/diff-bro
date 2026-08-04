import { generateKeyPairSync } from 'node:crypto'
import { fingerprint } from '../src/main/sealing.js'
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
    await page.getByRole('button', { name: 'Paste text' }).click()
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
    const viewport = page.viewportSize() ?? (await page.evaluate(() => ({
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
