// Generate the Homebrew cask for Diff Bro's macOS build.
//
//   node scripts/gen-homebrew-cask.mjs [version] [--dmg <path>]
//
// version    defaults to package.json's version.
// --dmg      hash a local DMG (e.g. dist/Diff-Bro-macOS.dmg after a build);
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

const REPO = 'mindaugaskasp/diff-bro'
const ASSET = 'Diff-Bro-macOS.dmg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const args = process.argv.slice(2)
  const dmgFlag = args.indexOf('--dmg')
  const localDmg = dmgFlag !== -1 ? args[dmgFlag + 1] : null
  const version =
    args.find((a) => !a.startsWith('--') && a !== localDmg) ??
    JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version

  const url = `https://github.com/${REPO}/releases/download/v${version}/${ASSET}`

  let bytes
  if (localDmg) {
    bytes = await readFile(localDmg)
  } else {
    process.stderr.write(`Downloading ${url} to compute sha256…\n`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not fetch ${url} (HTTP ${res.status}). Is v${version} released?`)
    bytes = Buffer.from(await res.arrayBuffer())
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  const cask = `cask "diff-bro" do
  version "${version}"
  sha256 "${sha256}"

  url "https://github.com/${REPO}/releases/download/v#{version}/${ASSET}"
  name "Diff Bro"
  desc "Offline-only desktop diff viewer"
  homepage "https://github.com/${REPO}"

  app "Diff Bro.app"

  # The build is not yet signed/notarized (see DEVELOPMENT_PLAN.md Phase 3), so
  # Gatekeeper would quarantine it. Install with \`--no-quarantine\`, or run:
  #   xattr -dr com.apple.quarantine "#{appdir}/Diff Bro.app"
  caveats <<~EOS
    Diff Bro is not yet signed or notarized. If macOS says it is "damaged",
    clear the quarantine flag once:
      xattr -dr com.apple.quarantine "#{appdir}/Diff Bro.app"
    or install with:  brew install --cask --no-quarantine diff-bro
  EOS
end
`

  const out = join(root, 'packaging', 'homebrew', 'diff-bro.rb')
  await writeFile(out, cask)
  process.stderr.write(`Wrote ${out}\n  version ${version}\n  sha256  ${sha256}\n`)
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`)
  process.exit(1)
})
