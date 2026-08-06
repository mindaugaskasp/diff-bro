// How the raw-text guard shells out to ESLint.
//
// Node's own binary against eslint's entry script — never `npx`. On Windows npx
// is `npx.cmd`, which execFile cannot spawn without a shell, and that spawn
// error surfaced downstream as `JSON.parse(undefined)`: a message naming neither
// npx nor eslint, in the only job that runs `npm run check` on Windows.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)

// Via package.json and the package's OWN `bin` field: eslint's `exports` map
// does not expose ./bin/eslint.js, so resolving the script path directly throws
// ERR_PACKAGE_PATH_NOT_EXPORTED. This also survives the entry being renamed.
const eslintBin = () => {
  const manifest = require.resolve('eslint/package.json')
  const { bin } = require(manifest)
  return resolve(dirname(manifest), typeof bin === 'string' ? bin : bin.eslint)
}

/**
 * @param {{ config: string, targets: string[] }} spec
 * @returns {{ command: string, args: string[] }}
 */
export function eslintJsonCommand({ config, targets }) {
  return {
    command: process.execPath,
    args: [eslintBin(), '--no-config-lookup', '-c', config, '-f', 'json', ...targets]
  }
}
