import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, openSettingsPage, launchApp, firstReadyPage } from './fixtures.mjs'
import { addPeer, startPeer, stop } from './lanPeers.mjs'

// Two launches per test.
test.describe.configure({ timeout: 90_000 })

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

// Keys made before names were capped at 40 (#124) still carry the longer name.
async function withLegacyKeyName(peer) {
  await peer.app.close()
  const file = join(peer.dir, 'identity.pub')
  const pub = JSON.parse(readFileSync(file, 'utf8'))
  writeFileSync(file, JSON.stringify({ ...pub, label: 'ASSSS'.repeat(16) }))
  peer.app = await launchApp(peer.dir)
  peer.page = await firstReadyPage(peer.app)
  await peer.page.evaluate((n) => window.api.lanUpdate({ name: n }), peer.name)
}

test('a key named before names were capped still adds, in both directions', async () => {
  const ana = await startPeer('Ana')
  await withLegacyKeyName(ana)
  const ben = await startPeer('Ben')
  try {
    await addPeer(ben, ana)
    await addPeer(ana, ben)
  } finally {
    await stop(ana, ben)
  }
})
