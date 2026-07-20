# Homebrew cask for Diff Bro (macOS). This is the reference copy — the real
# one lives in your Homebrew tap (a repo named homebrew-<tap>, as
# Casks/diff-bro.rb). Regenerate the version + sha256 for each release with:
#
#   make brew-cask                 # hashes the released DMG for the current version
#   make brew-cask VERSION=0.1.0   # a specific version
#
# CI does this automatically on release (see .github/workflows/release.yml).
cask "diff-bro" do
  version "0.1.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/mindaugaskasp/diff-bro/releases/download/v#{version}/Diff-Bro-macOS.dmg"
  name "Diff Bro"
  desc "Offline-only desktop diff viewer"
  homepage "https://github.com/mindaugaskasp/diff-bro"

  app "Diff Bro.app"

  # The build is not yet signed/notarized (see DEVELOPMENT_PLAN.md Phase 3), so
  # Gatekeeper would quarantine it. Install with `--no-quarantine`, or run the
  # xattr line below once.
  caveats <<~EOS
    Diff Bro is not yet signed or notarized. If macOS says it is "damaged",
    clear the quarantine flag once:
      xattr -dr com.apple.quarantine "#{appdir}/Diff Bro.app"
    or install with:  brew install --cask --no-quarantine diff-bro
  EOS
end
