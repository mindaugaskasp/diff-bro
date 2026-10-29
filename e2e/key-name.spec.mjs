import { generateKeyPairSync } from 'node:crypto'
import { KEY_FORMAT, encodePublicKey } from '../src/main/sealing.js'
import { test, expect, showPanel } from './fixtures.mjs'

const realKey = () => ({
  sign: generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }),
  box: generateKeyPairSync('x25519').publicKey.export({ type: 'spki', format: 'pem' })
})

const openKeys = (page) => showPanel(page, 'keys')

test('sharing my key needs a name of at most 40 characters, typed straight away', async ({
  page
}) => {
  await openKeys(page)
  await page.locator('.keys-panel').getByRole('button', { name: 'Share my key' }).click()
  const dialog = page.getByRole('dialog', { name: 'Share my public key' })
  const name = dialog.getByPlaceholder('e.g. Alice — laptop')
  await expect(name).toBeFocused()

  const actions = ['Save to file…', 'Copy to clipboard', 'Email it'].map((n) =>
    dialog.getByRole('button', { name: n })
  )
  await name.fill('')
  for (const a of actions) await expect(a).toBeDisabled()
  await expect(dialog.getByText('Add a name first')).toBeVisible()

  await name.fill('x'.repeat(41))
  await expect(name).toHaveValue('x'.repeat(41))
  await expect(dialog.getByText('Keep the name to 40 characters or fewer')).toBeVisible()
  for (const a of actions) await expect(a).toBeDisabled()

  await name.fill('Ana laptop')
  await expect(dialog.getByText('10 / 40')).toBeVisible()
  for (const a of actions) await expect(a).toBeEnabled()
})

test('a second key with a name already in use is offered a distinct one', async ({ app, page }) => {
  await openKeys(page)
  const paste = page.getByRole('button', { name: 'Add their key from clipboard' })
  const confirmDialog = page.getByRole('dialog', { name: 'Add Trusted Key' })
  const add = async () => {
    const text = encodePublicKey({ ...realKey(), format: KEY_FORMAT, label: 'Alex' })
    await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), text)
    await paste.click()
    await expect(confirmDialog).toBeVisible()
  }

  await add()
  await confirmDialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(confirmDialog).toBeHidden()

  await add()
  const field = confirmDialog.getByPlaceholder('e.g. Alice — laptop')
  await expect(field).toHaveValue('Alex (2)')
  await expect(confirmDialog.getByText(/You already have a key named “Alex”/)).toBeVisible()
  await field.fill('alex')
  await expect(confirmDialog.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
})
