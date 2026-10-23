// The app binary, never the PATH shim: on Windows the shim is `start ""`, which drops stdio.

/**
 * @param {{ exePath: string, appPath: string|null }} launch  appPath for an unpackaged run only
 * @returns {{ command: string, args: string[], cli: string, desktopJson: string }}
 */
export function claudeSetup({ exePath, appPath }) {
  const args = appPath ? [appPath, 'mcp'] : ['mcp']
  const quoted = [exePath, ...args].map((a) => JSON.stringify(a)).join(' ')
  return {
    command: exePath,
    args,
    cli: `claude mcp add diffbro -- ${quoted}`,
    desktopJson: JSON.stringify({ mcpServers: { diffbro: { command: exePath, args } } }, null, 2)
  }
}
