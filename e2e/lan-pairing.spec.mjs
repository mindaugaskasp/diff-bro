import { rmSync } from 'node:fs'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  openSettingsPage
} from './fixtures.mjs'

// Two launches per test.
test.describe.configure({ timeout: 90_000 })

// Ben adds Ana: Ana's screen shows the pairing code, Ben types or pastes it.
// Unique per run: parallel workers share the network, and each starts its own Ana and Ben.
const RUN = Math.random().toString(36).slice(2, 7)

async function startPeer(base) {
  const name = `${base} ${RUN}${Math.random().toString(36).slice(2, 4)}`
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)
  await page.evaluate((n) => window.api.lanUpdate({ name: n }), name)
  return { dir, app, page, name }
}

async function benAddsAna() {
  const ana = await startPeer('Ana')
  const ben = await startPeer('Ben')
  const settings = await openSettingsPage(ben.page, 'Network')
  const anaRow = settings.locator('.person', { hasText: ana.name })
  await expect(anaRow).toBeVisible({ timeout: 20_000 })
  await anaRow.getByRole('button', { name: 'Add' }).click()
  const shown = ana.page.getByRole('dialog', { name: `${ben.name} wants to add you` })
  await expect(shown).toBeVisible()
  const adding = ben.page.getByRole('dialog', { name: `Add ${ana.name}` })
  await expect(adding).toBeVisible()
  return { ana, ben, settings, anaRow, shown, adding }
}

async function stop(...peers) {
  for (const peer of peers) {
    await peer.app.close()
    rmSync(peer.dir, { recursive: true, force: true })
  }
}

test('the code copied on one screen and pasted on the other adds the key', async () => {
  const { ana, ben, anaRow, shown, adding } = await benAddsAna()
  try {
    await expect(shown.getByText(/Expires in \d:\d\d/)).toBeVisible()
    await shown.getByTestId('lan-code').click()
    await expect(shown.getByText('Copied')).toBeVisible()
    await adding.getByRole('button', { name: 'Paste' }).click()
    await expect(adding.getByTestId('lan-code-input')).toHaveValue(/^[2-9A-Z]{6}$/)
    await adding.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(adding).toBeHidden()
    await expect(anaRow.getByText('Trusted')).toBeVisible()
    const back = ana.page.getByRole('dialog', { name: `${ben.name} added you` })
    await expect(back).toBeVisible()
    await expect(back.getByRole('button', { name: 'Add back' })).toBeVisible()
  } finally {
    await stop(ana, ben)
  }
})

test('a wrong code adds nothing and ends it on both screens', async () => {
  const { ana, ben, anaRow, shown, adding } = await benAddsAna()
  try {
    const code = (await shown.getByTestId('lan-code').innerText()).replace(/\W/g, '').slice(0, 6)
    const wrong = code[0] === 'K' ? `M${code.slice(1)}` : `K${code.slice(1)}`
    await adding.getByTestId('lan-code-input').fill(wrong)
    await adding.getByRole('button', { name: 'Add', exact: true }).click()
    const benResult = ben.page.getByRole('dialog', { name: 'Code didn’t match' })
    await expect(benResult).toBeVisible()
    await expect(benResult.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(ana.page.getByRole('dialog', { name: 'Code didn’t match' })).toBeVisible()
    await benResult.locator('.dialog-actions').getByRole('button', { name: 'Close' }).click()
    await expect(anaRow.getByText('Trusted')).toHaveCount(0)
  } finally {
    await stop(ana, ben)
  }
})

test('cancelling on the code screen tells the person adding', async () => {
  const { ana, ben, shown } = await benAddsAna()
  try {
    await shown.getByRole('button', { name: 'Cancel' }).click()
    await expect(ben.page.getByRole('dialog', { name: 'Request cancelled' })).toBeVisible()
  } finally {
    await stop(ana, ben)
  }
})

test('the clipboard holding no code says so', async () => {
  const { ana, ben, adding } = await benAddsAna()
  try {
    await ben.page.evaluate(() => window.api.copyText('hello there'))
    await adding.getByRole('button', { name: 'Paste' }).click()
    await expect(adding.getByText('The clipboard doesn’t hold a pairing code.')).toBeVisible()
    await expect(adding.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
  } finally {
    await stop(ana, ben)
  }
})
