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

`enableEmbeddedAsarIntegrityValidation` is intentionally **off** until real
signing lands: it binds the ASAR hash to the code signature, and on an
unsigned / ad-hoc-signed macOS build that makes a quarantined app fail to launch
as *"Diff Bro is damaged"* even after the user clears quarantine. electron-builder
flips fuses *before* re-applying the ad-hoc macOS signature, so the flip order is
fine — the integrity fuse specifically needs a Developer ID signature to be safe.
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

Installers are named **version-lessly** (`Diff-Bro-Setup-Windows.exe`,
`Diff-Bro-macOS.dmg` — see `artifactName` in `electron-builder.yml`) so the
"download latest" URLs in the README stay stable across releases:
`…/releases/latest/download/<name>`. The version still lives in the tag, the
release title, and the app's About — just not the filename.

Builds are **unsigned** (no code-signing cert / Apple Developer account yet — see
`DEVELOPMENT_PLAN.md` Phase 3): Windows shows a SmartScreen warning, and macOS
Gatekeeper marks the app "damaged"/"can't be opened" because the download is
quarantined and unsigned. Clear the quarantine after copying to Applications:

```bash
xattr -dr com.apple.quarantine "/Applications/Diff Bro.app"
```

(or right-click → **Open** on first launch). There is deliberately no
auto-update — installers are the only distribution path.

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
