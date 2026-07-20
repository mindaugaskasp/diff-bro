# Security model

Diff Bro is offline-first and treats every imported file as hostile. The crypto
lives in small, pure, unit-tested modules in the main process; the sandboxed
renderer never sees key material.

## Offline guarantee

The app never makes network requests. A session-level kill-switch cancels every
request that isn't `file://` / `devtools://` / `blob:` / `data:` (dev mode also
allows the local Vite server), backed by a strict CSP, `sandbox: true`,
`contextIsolation`, a deny-all permission handler, and a `will-navigate` block.
No telemetry, no auto-update, no CDN assets.

## Saved diffs (vault)

Saved comparisons are AES-256-GCM encrypted at rest with an install-specific key
held by the OS keychain (`safeStorage`). The entry's plaintext metadata is bound
as GCM AAD, so tampering (e.g. extending an expiry in localStorage) makes the
entry undecryptable. Every entry auto-expires — default 1 h, hard cap 24 h.

## Sharing diffs (sealed `.diffbro` files)

A shared diff is **sign-then-encrypt**, sealed for one recipient:

- Signed with the sender's Ed25519 key over `payload ‖ recipient-fingerprint`
  (a recipient can't re-seal it for a third party).
- Encrypted with AES-256-GCM under a key from X25519 ECDH using a **fresh
  ephemeral key per file**; the GCM AAD covers `format ‖ recipient-fingerprint`.
- The absolute expiry is signed and enforced on both ends — 24 h max.

**Filename integrity.** The on-disk name is a hash of the (authenticated)
ciphertext, so it leaks nothing about the diff and a **renamed file is refused**
on import. **Trusted keys must be named**: importing or dropping a `.diffbrokey`
prompts for a label, and adding your own key is rejected. Manage names via
**Security → Manage Trusted Keys**.

## Keys and formats

- Identity private keys are wrapped by the OS keychain in `userData` and never
  cross IPC. Public keys are exported/copied in an obfuscated `dbk1:` envelope
  (a public key isn't secret — this just stops casual text-editor readability;
  legacy plain-JSON keys are still accepted).
- Wire formats are versioned (`diffbro-key/1`, `diffbro-share/2`) and matched
  exactly. **Rotation:** if a format is found vulnerable, bump its version
  constant in `src/main/sealing.js` and ship a release — old-format files then
  stop opening and all new files use the new version.

## Configuration backup

**Security → Back Up / Restore Configuration** writes a single
passphrase-encrypted (`scrypt` + AES-256-GCM) file containing your identity
keypair, trusted hosts, snippet library, and settings. Saved diffs are
deliberately excluded (they're ephemeral). The private identity key is read and
written only in the main process and only leaves it inside the encrypted blob.

## Snippets

The snippet library is encrypted at rest with the same vault key (no expiry). A
category (or the whole library) can be exported as a passphrase-protected,
**signed** `.diffbrosnip` file — no recipient key exchange needed.

---

Before each release, verify: zero outbound traffic while diffing (Wireshark /
Process Monitor); the sealed-share roundtrip in the Docker env; and grep for new
network calls in any added dependency.
