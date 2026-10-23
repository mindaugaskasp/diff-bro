import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, openSettings, stubMessageBox } from './fixtures.mjs'

// A stand-in `claude` in this profile's HOME: records argv, and on `mcp add` writes the entry.
function installFakeClaude(userDataDir) {
  const home = join(userDataDir, 'home')
  const bin = join(home, '.local', 'bin')
  mkdirSync(bin, { recursive: true })
  const cli = join(bin, 'claude')
  writeFileSync(
    cli,
    `#!/bin/sh
echo "$@" >> "$HOME/claude-argv.log"
if [ "$2" = "add" ]; then
  shift 6
  printf '{"mcpServers":{"diffbro":{"command":"%s","args":["%s","%s"]}}}' "$1" "$2" "$3" > "$HOME/.claude.json"
fi
`
  )
  chmodSync(cli, 0o755)
  return join(home, 'claude-argv.log')
}

async function openClaudeSettings(page) {
  await openSettings(page)
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('button', { name: 'Claude', exact: true }).click()
  await dialog.getByLabel('Enable Claude MCP connection').check()
  await dialog.getByRole('alertdialog').getByRole('button', { name: 'Enable', exact: true }).click()
  return dialog
}

const codeRow = (dialog) => dialog.locator('.app-row', { hasText: 'Claude Code' })

test('Connect adds Diff Bro to Claude Code for every session', async ({
  app,
  page,
  userDataDir
}) => {
  const argvLog = installFakeClaude(userDataDir)
  const dialog = await openClaudeSettings(page)
  await expect(codeRow(dialog)).toContainText('Not connected')

  await stubMessageBox(app, 0)
  await codeRow(dialog).getByRole('button', { name: 'Connect' }).click()

  await expect(codeRow(dialog)).toContainText('Connected')
  await expect(
    dialog.getByRole('status').filter({ hasText: 'New Claude Code sessions' })
  ).toBeVisible()
  const argv = readFileSync(argvLog, 'utf8').trim()
  expect(argv).toMatch(/^mcp add --scope user diffbro -- .+ mcp$/)
})

test('cancelling the confirmation runs nothing', async ({ app, page, userDataDir }) => {
  const argvLog = installFakeClaude(userDataDir)
  const dialog = await openClaudeSettings(page)
  await stubMessageBox(app, 1)
  await codeRow(dialog).getByRole('button', { name: 'Connect' }).click()
  await expect(codeRow(dialog)).toContainText('Not connected')
  expect(() => readFileSync(argvLog, 'utf8')).toThrow()
})

test('without Claude Code installed, the row says so and offers no button', async ({ page }) => {
  const systemWide = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude'].some(existsSync)
  test.skip(systemWide, 'a system-wide claude is installed on this machine')
  const dialog = await openClaudeSettings(page)
  await expect(codeRow(dialog)).toContainText('Not found on this computer')
  await expect(codeRow(dialog).getByRole('button')).toHaveCount(0)
  await expect(dialog.locator('.setup-block code').first()).toContainText(
    'claude mcp add --scope user diffbro'
  )
})
