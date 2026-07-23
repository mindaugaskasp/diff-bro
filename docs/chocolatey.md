# Releasing DiffBro on Chocolatey (Windows)

**Chocolatey** (`choco`) is a Windows package manager — the closest thing to
Homebrew for Windows. Once published, users install with:

```powershell
choco install diffbro
```

This is an **investigation + a ready-to-fill package skeleton**, not a shipped
package yet. DiffBro is a good fit because it already produces an **NSIS
installer** (`npm run build:win`) and attaches it to a **GitHub Release** via
`.github/workflows/release.yml` — Chocolatey's standard pattern is to download an
installer from a URL and verify its checksum, which maps onto that exactly.

---

## Two ways to distribute

| | Community repository | Your own feed |
|---|---|---|
| URL | `community.chocolatey.org` | Cloudsmith / GitHub Packages / MyGet / self-host |
| Audience | `choco install diffbro` works for everyone | users must `--source <url>` first |
| Cost | free | free tier / paid |
| Gate | **moderation** + automated validator & verifier | none |
| Effort | higher (strict rules, review wait) | low |

**Recommendation:** start with a **private/Cloudsmith feed** to prove the package
installs and uninstalls cleanly, then submit the *same* package to the community
repo once it passes locally. The community repo is where "brew-like" discovery
happens, but its moderation is strict and first-time packages get extra scrutiny.

---

## Package anatomy

A Chocolatey package is a `.nupkg` (a zip) built from a `.nuspec` plus a `tools/`
folder. Proposed layout, checked into `chocolatey/`:

```
chocolatey/
  diffbro.nuspec
  tools/
    chocolateyInstall.ps1
    chocolateyUninstall.ps1
    VERIFICATION.txt        # provenance of the downloaded binary (community repo)
    LICENSE.txt             # copy of the app license (community repo)
```

### `diffbro.nuspec`

The community validator requires the metadata URLs (rule CPMR0040 flags a missing
`packageSourceUrl`, etc.). Fill these in:

```xml
<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2015/06/nuspec.xsd">
  <metadata>
    <id>diffbro</id>                          <!-- lowercase, no spaces -->
    <version>0.1.0</version>                  <!-- match the GitHub Release tag -->
    <packageSourceUrl>https://github.com/mindaugaskasp/diff-bro/tree/main/chocolatey</packageSourceUrl>
    <owners>mindaugaskasp</owners>
    <title>Diff Bro</title>                   <!-- official spelling, spaces ok -->
    <authors>Mindaugas Kasparavičius</authors>
    <projectUrl>https://github.com/mindaugaskasp/diff-bro</projectUrl>
    <projectSourceUrl>https://github.com/mindaugaskasp/diff-bro</projectSourceUrl>
    <bugTrackerUrl>https://github.com/mindaugaskasp/diff-bro/issues</bugTrackerUrl>
    <docsUrl>https://github.com/mindaugaskasp/diff-bro/blob/main/README.md</docsUrl>
    <iconUrl>https://rawcdn.githack.com/mindaugaskasp/diff-bro/main/resources/icon.png</iconUrl>
    <licenseUrl>https://github.com/mindaugaskasp/diff-bro/blob/main/LICENSE</licenseUrl>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <tags>diff compare offline electron json xml excel diff-tool</tags>
    <summary>Offline-only desktop diff viewer with GitHub-style rendering.</summary>
    <description>Diff Bro compares text, code, JSON/XML, and Excel (.xlsx) files
      fully offline — no network, no telemetry. Encrypted saved diffs, sealed
      sharing, snippets, and Mermaid rendering.</description>
    <releaseNotes>https://github.com/mindaugaskasp/diff-bro/releases/tag/v0.1.0</releaseNotes>
  </metadata>
  <files>
    <file src="tools\**" target="tools" />
  </files>
</package>
```

### `tools/chocolateyInstall.ps1`

Download the NSIS installer from the GitHub Release and verify its SHA-256. NSIS
(electron-builder) installs silently with `/S`. **UTF-8 with BOM** is required.

```powershell
$ErrorActionPreference = 'Stop'
$version  = '0.1.0'
$url64     = "https://github.com/mindaugaskasp/diff-bro/releases/download/v$version/Diff-Bro-$version-setup.exe"

$packageArgs = @{
  packageName    = 'diffbro'
  fileType       = 'exe'
  url64bit       = $url64
  # sha256 of the exact released .exe — paste from the release checksums
  checksum64     = 'REPLACE_WITH_SHA256'
  checksumType64 = 'sha256'
  silentArgs     = '/S'                 # NSIS silent
  validExitCodes = @(0)
  softwareName   = 'Diff Bro*'
}
Install-ChocolateyPackage @packageArgs
```

### `tools/chocolateyUninstall.ps1`

```powershell
$ErrorActionPreference = 'Stop'
$key = Get-UninstallRegistryKey -SoftwareName 'Diff Bro*'
if ($key) {
  Uninstall-ChocolateyPackage -PackageName 'diffbro' -FileType 'exe' `
    -SilentArgs '/S' -File "$($key.UninstallString)"
}
```

---

## What DiffBro needs to change

1. **Deterministic installer filename + checksum in the release.** The nuspec
   points at a fixed URL, so `release.yml` should upload a predictably-named
   `Diff-Bro-<version>-setup.exe` **and** publish its SHA-256 (electron-builder
   emits a `latest.yml`/`.blockmap`; add a checksums step or read from there).
2. **Confirm silent + machine-wide install.** electron-builder's default NSIS is
   a per-user one-click install. Chocolatey usually installs machine-wide (admin
   shell), so set in `electron-builder.yml`:
   ```yaml
   nsis:
     oneClick: true
     perMachine: true       # install for all users (choco runs elevated)
     allowElevation: true
   ```
   Verify `Setup.exe /S` installs and the uninstall string supports `/S`.
3. **Package source in-repo.** Add the `chocolatey/` folder above so the
   community repo's `packageSourceUrl` resolves.

---

## Community-repo moderation checklist

Every version is auto-**validated** (metadata rules), auto-**verified** (test
install + uninstall on a clean Windows VM), then human-**moderated**:

- [ ] All metadata URLs present (project, source, bugtracker, docs, license, icon,
      `packageSourceUrl`).
- [ ] `id` lowercase; `<title>` is the real app name.
- [ ] Files UTF-8; `.ps1` UTF-8 **with BOM**.
- [ ] Downloaded binary has `checksum64` + `checksumType64`.
- [ ] `tools/VERIFICATION.txt` explaining how a moderator can reproduce the
      checksum (download URL + `Get-FileHash`), and `LICENSE.txt`.
- [ ] Silent install/uninstall exits `0` on the verifier VM.
- [ ] You're the software author (you are) — no third-party-copyright friction.

Publish with an account + API key:

```powershell
choco pack chocolatey\diffbro.nuspec
choco push diffbro.0.1.0.nupkg --source https://push.chocolatey.org/ --api-key <KEY>
```

---

## Keeping it current (optional)

Community maintainers use the **Chocolatey-AU** PowerShell module: an `update.ps1`
watches the GitHub Releases API, rewrites the version + URL + checksum, packs, and
pushes on each new tag. This can run as a scheduled GitHub Action so a new
DiffBro release lands on Chocolatey automatically.

---

## Effort & open questions

- **Effort:** ~half a day to author + test the package on a Windows VM against a
  private feed; community-repo submission adds review wait (days) and any
  validator fixes. AU automation ~half a day more.
- **Open questions to decide first:**
  - **Code signing.** Chocolatey doesn't require it, but an unsigned NSIS
    installer still trips SmartScreen; signing (OV cert ~€70–200/yr or Azure
    Trusted Signing) is the real fix and separate from packaging.
  - **Per-user vs per-machine** install (see step 2) — pick one and make the
    NSIS config + uninstall match.
  - **winget** — worth doing alongside choco; it's Microsoft's built-in manager
    and uses a similar "installer URL + SHA256" manifest, so most of the work
    above (deterministic filename + published checksum + silent flags) is shared.

**Sources:** [Create Packages](https://docs.chocolatey.org/en-us/create/create-packages/) ·
[Package validator rule CPMR0040](https://docs.chocolatey.org/en-us/community-repository/moderation/package-validator/rules/cpmr0040/) ·
[electron-app packages on the community repo](https://community.chocolatey.org/packages?q=tag:electron-app)
