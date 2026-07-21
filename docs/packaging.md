# Packaging & releasing

Every target bundles main/preload/renderer to `build/` (via `electron-vite
build`, not electron-builder's default) and packages an installer into `dist/`.

```bash
npm run build:win     # NSIS installer  -> dist/
npm run build:mac     # DMG -> dist/            (macOS host only)
npm run build:linux   # AppImage + .deb -> dist/
```

The Windows and Linux installers can also be built in the container without a
local Node install — `make package-win` / `make package-linux` run them in an
amd64 service (electron-builder's bundled `makensis` is x86_64-only and shells
out to wine). A DMG needs macOS's `hdiutil`, so `make package-mac` runs on the
host. The DMG window size, icon positions and backdrop live in
`electron-builder.yml` (backdrop rendered from `resources/dmg-background.svg`).

## Binary hardening (fuses + ASAR)

`electron-builder.yml` sets `asar: true` and flips the Electron fuses that harden
the packaged binary at pack time:

- `runAsNode`, `enableNodeCliInspectArguments`, `enableNodeOptionsEnvironmentVariable`
  **off** — stops `ELECTRON_RUN_AS_NODE=1 "Diff Bro.exe" script.js` turning the
  installed, trusted binary into a generic Node interpreter (a LOLBin).
- `onlyLoadAppFromAsar` **on** — the runtime refuses to load app code from
  anywhere but the ASAR.
- `enableCookieEncryption` **on**.
- `resetAdHocDarwinSignature` **on** — mandatory on Apple silicon. Flipping the
  fuse wire rewrites the Electron binary and invalidates the linker-signed
  ad-hoc signature it ships with, and `mac.identity: null` means
  electron-builder signs nothing afterwards. Without it the DMG contains an app
  whose signature is structurally broken (`codesign --verify` reports *"code has
  no resources but signature indicates they must be present"*), which macOS
  reports as *"damaged"* and which clearing quarantine does **not** fix. With it,
  `@electron/fuses` re-signs the whole bundle ad-hoc right after the flip.

`enableEmbeddedAsarIntegrityValidation` is intentionally **off** until real
signing lands: it binds the ASAR hash to the code signature, and on an
unsigned / ad-hoc-signed macOS build that makes a quarantined app fail to launch
as *"Diff Bro is damaged"* even after the user clears quarantine. The fuses are
flipped *before* the ad-hoc re-signature, so the flip order is fine — the
integrity fuse specifically needs a Developer ID signature to be safe.
Turn it back on together with signing (`DEVELOPMENT_PLAN.md` Phase 3).

Code signing (Windows Authenticode + macOS notarization) is the remaining
prerequisite — see below and `DEVELOPMENT_PLAN.md` Phase 3.

## Windows: enable Developer Mode first

`build:win` extracts electron-builder's `winCodeSign` cache, which contains
macOS `.dylib` files stored as symlinks. Creating a symlink on Windows needs
`SeCreateSymbolicLinkPrivilege`, which normal accounts lack unless Developer
Mode is on — otherwise the build fails with *"Cannot create symbolic link: A
required privilege is not held by the client."*

Enable it once via **Settings → Privacy & security → For developers → Developer
Mode**, then re-run. If a build already failed partway, clear the partial cache:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
```

## Releasing

Pushing a tag matching `v*.*.*` runs
[`.github/workflows/release.yml`](../.github/workflows/release.yml): it audits
dependencies, lints + tests, syncs `package.json`'s version to the tag (so the
app reports the right version), builds Windows and macOS installers in parallel,
and attaches them to a GitHub Release.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Installers are **version-stamped** (`diff-bro-Setup-v0.1.8.exe`,
`diff-bro-v0.1.8.dmg` — see `artifactName` in `electron-builder.yml`), so a
downloaded file stays identifiable once it's away from the release page.
`${version}` resolves from `package.json`, which the *Sync version to the
release tag* step rewrites from the tag before packaging.

Because the filename changes every release, GitHub's
`…/releases/latest/download/<name>` shortcut no longer works — it requires a
fixed name. The README links to the releases page instead. Three places must
change together when the name does: `electron-builder.yml`, the `asset()` /
`ASSET_TEMPLATE` pair in `scripts/gen-homebrew-cask.mjs`, and the
`gh release download --pattern` in the `homebrew` job of `release.yml`.

Builds are **unsigned** (no code-signing cert / Apple Developer account yet — see
`DEVELOPMENT_PLAN.md` Phase 3): Windows shows a SmartScreen warning, and macOS
Gatekeeper marks the app "damaged"/"can't be opened" because the download is
quarantined and unsigned. Clear the quarantine after copying to Applications:

```bash
xattr -dr com.apple.quarantine "/Applications/Diff Bro.app"
```

(or right-click → **Open** on first launch). There is deliberately no
auto-update — installers are the only distribution path.

## Homebrew (macOS)

Diff Bro installs as a Homebrew **cask** from a personal **tap** — a separate
repo named `homebrew-<name>` (e.g. `mindaugaskasp/homebrew-tap`, tapped as
`mindaugaskasp/tap`). The cask ([packaging/homebrew/diff-bro.rb](../packaging/homebrew/diff-bro.rb))
points at the tagged release DMG and pins its `sha256`.

**Automated on release.** The `homebrew` job in `release.yml` runs after the
GitHub Release is published: it downloads the released `diff-bro-v<version>.dmg`,
regenerates the cask (version + sha256) via
[`scripts/gen-homebrew-cask.mjs`](../scripts/gen-homebrew-cask.mjs), and pushes
it to the tap — so `brew upgrade --cask diff-bro` always gets the latest. It
skips cleanly unless two things are configured:

- a repo **secret** `HOMEBREW_TAP_TOKEN` — a PAT with write access to the tap repo;
- optionally a repo **variable** `HOMEBREW_TAP_REPO` (defaults to
  `mindaugaskasp/homebrew-tap`).

**One-time setup:** create the `homebrew-tap` repo, add the token, then let the
next release populate `Casks/diff-bro.rb` (or seed it once with `make brew-cask`
+ a manual copy). Regenerate locally anytime with `make brew-cask`
(`VERSION=x.y.z` and/or `DMG=dist/diff-bro-v0.1.8.dmg` to override the source).

Because the build isn't notarized yet, the cask's caveats tell users to clear
the quarantine flag with `xattr` after installing. Homebrew 6 **removed**
`brew install --cask --no-quarantine` — the flag now errors out as an invalid
option, and the `HOMEBREW_CASK_OPTS` route is dead code (`cask_opts_quarantine?`
has no callers), so every cask install is quarantined. That makes the ad-hoc
signature from `resetAdHocDarwinSignature` load-bearing: without it, clearing
quarantine does not rescue the app.

The cask declares `depends_on arch: :arm64` and `depends_on macos: :monterey`
(a bare symbol is Homebrew's ">=" form) to match the arm64-only DMG and the
app's `LSMinimumSystemVersion`, so `brew install` fails fast on an unsupported
Mac. Without the `macos` stanza `brew audit` crashes outright. Validate a
change with `brew style` and `brew audit --cask --online` against a local tap.

Submitting to the **official** homebrew-cask isn't an option until the app is
signed + notarized (Phase 3).

## CI dependency-warning guard

`release.yml` captures the `npm ci` log and runs
[`scripts/check-install-warnings.mjs`](../scripts/check-install-warnings.mjs),
which fails the build on any new deprecation / engine warning that isn't in its
reviewed allowlist (the current allowlisted ones are build-time-only transitive
deps of electron-builder's native-rebuild toolchain, which this app never runs).

## CI vulnerability gate

A dedicated `audit` job runs `npm audit --audit-level=moderate` on a cheap
runner before any packaging, and `build` `needs:` it — so a tag push with a
known moderate/high/critical vulnerability in the dependency tree fails the
release fast, before spending Windows/macOS build minutes. Tighten the threshold
to `--audit-level=low` to block on any advisory at all.
