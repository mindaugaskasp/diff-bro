// Generate the Homebrew cask for Diff Bro's macOS build.
//
//   node scripts/gen-homebrew-cask.mjs [version] [--dmg <path>]
//
// version    defaults to package.json's version.
// --dmg      hash a local DMG (e.g. dist/diff-bro-v0.1.8.dmg after a build);
//            otherwise the script downloads the tagged release asset and hashes
//            that, so the sha256 matches exactly what users will download.
//
// The result is written to packaging/homebrew/diff-bro.rb. Copy that file into
// your Homebrew tap (a repo named `homebrew-<tap>`, e.g. Casks/diff-bro.rb) and
// push — see docs/packaging.md. A cask is the only per-release step Homebrew
// needs; the download URL is the tagged GitHub release asset.
import { createHash } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { REPO, asset, caskText } from './lib/homebrewCask.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const args = process.argv.slice(2)
  const dmgFlag = args.indexOf('--dmg')
  const localDmg = dmgFlag !== -1 ? args[dmgFlag + 1] : null
  const version =
    args.find((a) => !a.startsWith('--') && a !== localDmg) ??
    JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version

  const url = `https://github.com/${REPO}/releases/download/v${version}/${asset(version)}`

  let bytes
  if (localDmg) {
    bytes = await readFile(localDmg)
  } else {
    process.stderr.write(`Downloading ${url} to compute sha256…\n`)
    const res = await fetch(url)
    if (!res.ok)
      throw new Error(`Could not fetch ${url} (HTTP ${res.status}). Is v${version} released?`)
    bytes = Buffer.from(await res.arrayBuffer())
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  const cask = caskText({ version, sha256 })

  const out = join(root, 'packaging', 'homebrew', 'diff-bro.rb')
  await writeFile(out, cask)
  process.stderr.write(`Wrote ${out}\n  version ${version}\n  sha256  ${sha256}\n`)
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`)
  process.exit(1)
})
