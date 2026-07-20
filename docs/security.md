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

## File access (compromised-renderer threat model)

All filesystem access lives in the main process; the renderer only asks. Because
the threat model assumes the renderer can be compromised, `file:read` will not
serve an arbitrary path: a path is readable only after it was returned by the
open dialog or registered from a **real** OS drag-drop (the preload registers it
via `webUtils.getPathForFile` before the read is requested). A path the renderer
merely invents is refused, and reads under `userData` are denied outright — so a
compromised renderer can't turn `file:read` into an arbitrary-file-read primitive
(SSH keys, tokens, or the key files themselves on installs with no OS keychain).

## Saved diffs (vault)

Saved comparisons are AES-256-GCM encrypted at rest with an install-specific key
held by the OS keychain (`safeStorage`). The entry's plaintext metadata is bound
as GCM AAD, so tampering (e.g. extending an expiry) makes the entry
undecryptable. Every entry auto-expires — default 1 h, hard cap 24 h.

**Where data lives.** Saved diffs (`vault.json`), snippets (`snippets.json`),
and the key files (`identity.*`, `trusted-keys.json`, `vault.key`) are written
as files in a **configurable data directory** (Settings → Data folder), which
defaults to `userData`. Pointing it at a folder you control — under Documents,
say — means the data **survives an app reinstall** that wipes `userData`; the
folder is self-contained, so re-pointing at it after reinstall restores
everything. Writes are atomic (temp file + rename) so a crash can't corrupt a
store. Only a pointer to the location stays in `userData`.

**Metadata is not encrypted.** Only diff/snippet *content* is encrypted. The
entry name, category names, timestamps, favorite flag, and a shared diff's
sender label are stored in plaintext in `vault.json` / `snippets.json` (they
organize the UI and form the AAD). Names can leak content — e.g.
`prod-secrets-rotation.diff` — so avoid putting sensitive information in names if
the data directory might be read by someone else.

**Key loss is not silent.** The vault and identity keys are regenerated only on a
genuinely first run (the key file is absent). If a key file *exists* but can't be
loaded right now — a locked keychain, a DPAPI error after a profile move, a
recoverable corruption — the main process surfaces a distinct
`vault-key-unavailable` / `identity-unavailable` error and **never overwrites the
file**. The renderer keeps every saved diff and snippet intact and shows a
"try again once it's unlocked" notice, rather than purging entries or minting a
new identity (which would silently break every peer's trust).

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

**No replay protection (by design).** Within its ≤ 24 h TTL a `.diffbro` file can
be imported repeatedly, and a re-delivered old share is indistinguishable from a
new one. Sealing guarantees confidentiality, sender authenticity, recipient
binding, and integrity — but not freshness or once-only delivery. Treat a share
as "this sender sent me this content, valid until its expiry", not "this is new."

## Keys and formats

- Identity private keys are wrapped by the OS keychain in `userData` and never
  cross IPC. Public keys are exported/copied in an obfuscated `dbk1:` envelope
  (a public key isn't secret — this just stops casual text-editor readability;
  legacy plain-JSON keys are still accepted).
- Every trust decision keys off a **128-bit fingerprint** (32 hex chars) over
  both public keys — trusted-key lookup, the recipient binding in the signature,
  and the GCM AAD. 128 bits keeps a targeted crafted-keypair second preimage at
  ~2¹²⁸ and collisions (adversary controls both keys) at ~2⁶⁴.
- Wire formats are versioned (`diffbro-key/2`, `diffbro-share/3`) and matched
  exactly. **Rotation:** if a format is found vulnerable, bump its version
  constant in `src/main/sealing.js` and ship a release — old-format files then
  stop opening and all new files use the new version. (The current versions
  revoked the earlier 64-bit-fingerprint key/share formats.)

## Configuration backup

**Security → Back Up / Restore Configuration** writes a single
passphrase-encrypted (`scrypt` + AES-256-GCM) file containing your identity
keypair, trusted hosts, snippet library, and settings. Saved diffs are
deliberately excluded (they're ephemeral). The private identity key is read and
written only in the main process and only leaves it inside the encrypted blob.

## Snippets

The snippet library is encrypted at rest with the same vault key (no expiry). A
category (or the whole library) can be exported as a passphrase-protected,
**signed** `.diffbrosnip` file — no recipient key exchange needed. On import, a
decryptable file is still treated as hostile (the passphrase gates
confidentiality, not the sender's honesty): the main process validates the
bundle's shape and enforces count/size caps (`validateSnippetBundle`) before the
renderer touches it, so a malformed-but-decryptable file can't half-write state
or blow the localStorage quota. The same check guards the config-restore path.

## Tools → Encrypt/Decrypt Text

The local passphrase text tool uses **authenticated AES-256-GCM only**
(scrypt-derived key, random salt/IV embedded in a self-describing blob). An
unauthenticated mode (CBC) was removed: without a MAC, a tampered blob can
decrypt "successfully" to attacker-influenced garbage — a footgun for a tool
reached for precisely when integrity matters.

---

Before each release, verify: zero outbound traffic while diffing (Wireshark /
Process Monitor); the sealed-share roundtrip in the Docker env; and grep for new
network calls in any added dependency.
