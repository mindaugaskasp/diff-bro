import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import {
  test,
  expect,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  openNewSnippet,
  openSettings,
  showPanel
} from './fixtures.mjs'
import { workerEnv } from './workerEnv.mjs'

// Only a real second process can show it reading what the app wrote, under the grant it signed.

const MAIN = join(fileURLToPath(new URL('..', import.meta.url)), 'build', 'main', 'index.js')

// Playwright launches the app on Chromium's mock keychain; its vault key opens only under the same.
const MCP_ARGS = (userDataDir) => [
  MAIN,
  `--user-data-dir=${userDataDir}`,
  '--use-mock-keychain',
  'mcp'
]

function mcpClient(userDataDir) {
  const env = { ...workerEnv(userDataDir) }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electronPath, MCP_ARGS(userDataDir), { env })
  const waiting = new Map()
  createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line)
    waiting.get(msg.id)?.(msg)
  })
  let nextId = 1
  const request = (method, params) =>
    new Promise((resolve) => {
      const id = nextId++
      waiting.set(id, resolve)
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  const callTool = async (name, args = {}) => {
    const res = await request('tools/call', { name, arguments: args })
    return res.result
  }
  return { request, callTool, close: () => child.stdin.end() }
}

async function createSnippet(page, name, body, { secret = false } = {}) {
  await openNewSnippet(page)
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type(body)
  if (secret) await editor.locator('.secret-toggle input[type="checkbox"]').check()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function openClaudeSettings(page) {
  await openSettings(page)
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('button', { name: 'Claude', exact: true }).click()
  return dialog
}

async function enableWith(page, scopes) {
  const dialog = await openClaudeSettings(page)
  await dialog.getByLabel('Enable Claude MCP connection').check()
  const warning = dialog.getByRole('alertdialog')
  await expect(warning).toContainText('never shared')
  await warning.getByRole('button', { name: 'Enable', exact: true }).click()
  for (const scope of scopes) await dialog.getByLabel(scope).check()
  return dialog
}

// A ticked box is the click, not the signed grant: wait for main to have written it.
const toolNames = async (client) =>
  (await client.request('tools/list')).result?.tools.map((t) => t.name) ?? []
const grantReaches = (client, names) => expect.poll(() => toolNames(client)).toEqual(names)

test('the connection is off until the user confirms the warning', async ({ page, userDataDir }) => {
  const client = mcpClient(userDataDir)
  try {
    const init = await client.request('initialize', { protocolVersion: '2025-06-18' })
    expect(init.result.serverInfo.name).toBe('diffbro')
    expect((await client.request('tools/list')).error.code).toBe(-32001)

    const dialog = await openClaudeSettings(page)
    await dialog.getByLabel('Enable Claude MCP connection').check()
    await dialog.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog.getByLabel('Enable Claude MCP connection')).not.toBeChecked()
    expect((await client.request('tools/list')).error.code).toBe(-32001)
  } finally {
    client.close()
  }
})

test('Claude reads allowed snippets, never a secret, and its proposal waits on Home', async ({
  page,
  userDataDir
}) => {
  await createSnippet(page, 'Deploy notes', 'kubectl rollout restart')
  await createSnippet(page, 'Prod token', 'sk-live-0123', { secret: true })
  await enableWith(page, ['Read snippets', 'Offer new snippets'])
  await page.keyboard.press('Escape')

  const client = mcpClient(userDataDir)
  try {
    await grantReaches(client, ['list_snippets', 'get_snippet', 'propose_snippet'])

    const names = JSON.parse((await client.callTool('list_snippets')).content[0].text).map(
      (s) => s.name
    )
    expect(names).toContain('Deploy notes')
    expect(names).not.toContain('Prod token')
    const [deploy] = JSON.parse(
      (await client.callTool('list_snippets', { query: 'deploy' })).content[0].text
    )
    const read = JSON.parse(
      (await client.callTool('get_snippet', { id: deploy.id })).content[0].text
    )
    expect(read.content).toBe('kubectl rollout restart')

    const proposed = await client.callTool('propose_snippet', {
      name: 'Rollback',
      content: 'kubectl rollout undo',
      note: 'The inverse of Deploy notes'
    })
    expect(proposed.isError).toBeUndefined()
  } finally {
    client.close()
  }

  await showPanel(page, 'home')
  const inbox = page.locator('.home-block', { hasText: 'From Claude' })
  await expect(inbox.getByRole('heading')).toHaveText('From Claude · 1 to review')
  await expect(inbox).toContainText('The inverse of Deploy notes')
  await inbox.getByRole('button', { name: 'Accept' }).click()
  await expect(inbox).toHaveCount(0)

  await showPanel(page, 'snippets')
  await expect(page.locator('.snippets-section .row', { hasText: 'Rollback' })).toBeVisible()
})

// A Claude app may start this before DiffBro has ever made a vault key.
test('a session started before the app has a key sees the grant once given', async () => {
  const dir = freshUserDataDir()
  const client = mcpClient(dir)
  let app
  try {
    expect((await client.request('tools/list')).error.code).toBe(-32001)
    expect(existsSync(join(dir, 'vault.key'))).toBe(false)
    app = await launchApp(dir)
    const page = await firstReadyPage(app)
    await enableWith(page, ['Read snippets'])
    await grantReaches(client, ['list_snippets', 'get_snippet'])
  } finally {
    client.close()
    await app?.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('unticking the switch revokes access at the next call', async ({ page, userDataDir }) => {
  const dialog = await enableWith(page, ['Read snippets'])
  const client = mcpClient(userDataDir)
  try {
    await grantReaches(client, ['list_snippets', 'get_snippet'])
    await dialog.getByLabel('Enable Claude MCP connection').uncheck()
    await expect(dialog.getByLabel('Read snippets')).toHaveCount(0)
    expect((await client.request('tools/list')).error.code).toBe(-32001)
  } finally {
    client.close()
  }
})

test('the activity list names what Claude touched', async ({ page, userDataDir }) => {
  await createSnippet(page, 'Deploy notes', 'kubectl rollout restart')
  const dialog = await enableWith(page, ['Read snippets'])
  const client = mcpClient(userDataDir)
  try {
    await grantReaches(client, ['list_snippets', 'get_snippet'])
    const [first] = JSON.parse(
      (await client.callTool('list_snippets', { query: 'deploy' })).content[0].text
    )
    await client.callTool('get_snippet', { id: first.id })
  } finally {
    client.close()
  }
  await dialog.getByRole('button', { name: 'Logs', exact: true }).click()
  await dialog.getByRole('button', { name: 'Claude', exact: true }).click()
  const activity = dialog.locator('.activity-list')
  await expect(activity.locator('li').first()).toContainText('get_snippet')
  await expect(activity.locator('li').first()).toContainText('Deploy notes')
  await expect(activity).not.toContainText('kubectl')
})
