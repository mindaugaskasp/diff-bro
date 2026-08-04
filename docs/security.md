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

**Emailing a diff does not change this.** Diff Bro never sends: it seals the
file, hands a `mailto:` to your OS, copies the sealed file to the clipboard, and
stops. Your own mail client does the sending, and it is outside this fence — the
guarantee is about what this process does. An in-app SMTP client was specced and
rejected rather than shipped, because the kill switch would not have caught it:
it filters `session.defaultSession.webRequest`, which is Chromium traffic only,
so a main-process `tls.connect` would have been invisible to it.

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
undecryptable. Every entry auto-expires — default 1 h, up to a week (or is
kept until you delete it).

**The open comparisons are stored the same way.** Whatever is open when you quit
is reopened on the next launch, so `session.json` holds the compared file
contents — the same class of data as a saved diff, and sealed with the same
vault key (AAD `session|v1`). It is rewritten as you work, replaced by an empty
marker once you close the last comparison, and never restored from a file that
fails authentication. A locked keychain leaves it untouched rather than
discarding it. **Settings → Storage** turns the whole thing off — which also
forgets the session already stored, rather than merely skipping the next write. There is one difference from a loaded file: a restored comparison
is the text as you left it, and stops following the file on disk until you open
that file again — a path is only re-readable after you choose it (see the
provenance allowlist in `src/main/files.js`).

**Where data lives.** Saved diffs (`vault.json`), snippets (`snippets.json`),
the open session (`session.json`), and the key files (`identity.*`, `trusted-keys.json`, `vault.key`) are written
as files in a **configurable data directory** (Settings → Data folder), which
defaults to `userData`. Pointing it at a folder you control — under Documents,
say — means the data **survives an app reinstall** that wipes `userData`; the
folder is self-contained, so re-pointing at it after reinstall restores
everything. Writes are atomic (temp file + rename) so a crash can't corrupt a
store. Only a pointer to the location stays in `userData`.

**Metadata is not encrypted.** Only diff/snippet _content_ is encrypted. The
entry name, category names, timestamps, favorite flag, and a shared diff's
sender label are stored in plaintext in `vault.json` / `snippets.json` (they
organize the UI and form the AAD). Names can leak content — e.g.
`prod-secrets-rotation.diff` — so avoid putting sensitive information in names if
the data directory might be read by someone else.

**Key loss is not silent.** The vault and identity keys are regenerated only on a
genuinely first run (the key file is absent). If a key file _exists_ but can't be
loaded right now — a locked keychain, a DPAPI error after a profile move, a
recoverable corruption — the main process surfaces a distinct
`vault-key-unavailable` / `identity-unavailable` error and **never overwrites the
file**. The renderer keeps every saved diff and snippet intact and shows a
"try again once it's unlocked" notice, rather than purging entries or minting a
new identity (which would silently break every peer's trust).

## Sharing diffs (sealed `.diffbro` files)

A shared diff is **sign-then-encrypt**, sealed for an **audience** — one
recipient or a whole team, in one file:

- The diff is encrypted **once** with AES-256-GCM under a random content key.
  That key is then wrapped separately for each recipient, using X25519 ECDH from
  a **fresh ephemeral key per file**. Adding a recipient adds a wrapped key, not
  a second copy of the diff.
- The audience — the sorted set of recipient fingerprints, digested — is what
  everything commits to: the Ed25519 signature covers `payload ‖ audience`, the
  content's GCM AAD covers `format ‖ audience`, and each wrapped key's AAD covers
  `format ‖ recipient-fingerprint ‖ audience`. So the recipient list cannot be
  edited, a key cannot be lifted from one recipient's slot into another's, and a
  recipient cannot re-seal the diff for a third party.
- The absolute expiry is signed and enforced on both ends — one week max.
  You choose it when saving; every copy dies at the same moment.

**The recipient list is not secret.** It travels in the clear so each recipient
can recompute the audience and verify the bindings above. Everyone the file is
addressed to therefore learns who else received it, and anyone holding the file
sees the fingerprints (not the names) it was sealed for.

**Filename integrity.** The on-disk name is a hash of the (authenticated)
ciphertext, so it leaks nothing about the diff and a **renamed file is refused**
on import. **Trusted keys must be named**: importing or dropping a `.diffbrokey`
prompts for a label, and adding your own key is rejected. Manage names via
**Security → Manage Trusted Keys**.

**No replay protection (by design).** Within its TTL a `.diffbro` file can be
imported repeatedly, and a re-delivered old share is indistinguishable from a
new one. The expiry you choose is therefore also the replay window — pick a
short one for anything sensitive, and a week only when convenience matters more. Sealing guarantees confidentiality, sender authenticity, recipient
binding, and integrity — but not freshness or once-only delivery. Treat a share
as "this sender sent me this content, valid until its expiry", not "this is new."

**Revocation is not a thing a `.diffbro` can have.** Once the file is on someone
else's disk and they hold the private key it is addressed to, nothing on your
machine changes bytes on theirs. What exists instead, in order of how
enforceable it actually is:

- **Expiry** — signed and checked on open, by our own code reading the local
  clock. A deadline, not a control: a patched build or a rolled-back clock
  opens it anyway. This is the closest thing to revocation there is, which is
  why the sender picks the window.
- **Removing a trusted key** — real, and local: no _future_ share can be
  addressed to them. It does nothing to what has already been sent.
- **Replacing your key** — see below. It is about impersonation, not recall.

## Emailing a sealed diff

A trusted key can carry an email address, typed by you. It is a delivery hint
attached to an identity, never a substitute for one:

- **The address never travels in a `.diffbrokey`.** It lives only in your own
  `trusted-keys.json`, so it can never be attacker-supplied on import, and a
  peer's key file cannot make you mail a third party.
- **Validated before it is stored**, not on the way out. Anything carrying CR/LF,
  a comma, a semicolon, angle brackets or whitespace is refused, so a stored
  address cannot inject a second header into the URL.
- **What you attach is the same sealed file** — sign-then-encrypt, bound to the
  audience, filename forced to a hash of its own ciphertext. Your mail provider
  holds ciphertext addressed to a key it does not have.
- **The recipient must still be a trusted key.** There is no route that mails a
  diff to an address you have not tied to one.

## Copy as file, and the plaintext window it opens

**Copy as file** puts a real file on the clipboard. A file on the clipboard is a
_path_, so the bytes must exist on disk until you paste — which for a snippet
means its plaintext lives briefly outside the vault. That is a real trade, so it
is bounded rather than assumed away:

- a `0o700` staging directory under the OS temp dir;
- pruned 30 minutes after staging, and swept on quit **and** again on next
  launch (a crash skips the first, and plaintext surviving a reboot is the
  failure that matters);
- names slugged flat, so a snippet titled `../../.ssh/config` cannot escape;
- **a secret snippet refuses Copy as file** — its whole guarantee is that the
  contents never land somewhere readable, which a volatile text clipboard
  honours and a file does not. Copy content still works;
- a sealed `.diffbro` is unaffected: it is ciphertext, so staging it exposes
  nothing.

## Replacing your key (rotation)

**Security → Replace My Key** generates a new identity and keeps the previous
one as **decrypt-only**. What it buys is narrow and worth stating exactly:

- A leaked private key stops being able to **sign new files in your name**, once
  each peer holds your new key.
- It does **not** make diffs you already shared unreadable. Those were encrypted
  to the _recipient's_ key; yours only signed them.

The old private key is **retired, never silently destroyed** — a diff sealed to
it before the rotation is still addressed to a key this machine holds, and
`openSealedWith` tries the current identity first, then each retired one. Only a
retired key ever decrypts; nothing is signed or sealed with one again. Destroying
them is a separate, acknowledged action (the right move after a leak), and it
permanently gives up any unopened diff addressed to them.

A new key carries a **rotation record** — `{ from, to, at }` signed by _both_ the
old key and the new one — so a peer who already trusts the old fingerprint sees
"this replaces a key you trust" instead of "unknown key". It is **advisory**:
whoever holds a leaked private key can sign a rotation to a key of their own, so
the record downgrades the out-of-band check and never replaces it. The predecessor's
signing key is read from the local trust store, never from the file, and the
import dialog names which key vouched and still says to verify.

## Keys and formats

- Identity private keys are wrapped by the OS keychain in `userData` and never
  cross IPC. Public keys are exported/copied in an obfuscated `dbk1:` envelope
  (a public key isn't secret — this just stops casual text-editor readability;
  legacy plain-JSON keys are still accepted).
- Every trust decision keys off a **128-bit fingerprint** (32 hex chars) over
  both public keys — trusted-key lookup, the audience binding in the signature,
  and the GCM AAD. 128 bits keeps a targeted crafted-keypair second preimage at
  ~2¹²⁸ and collisions (adversary controls both keys) at ~2⁶⁴.
- Wire formats are versioned (`diffbro-key/2`, `diffbro-share/4`) and matched
  exactly. **Rotation:** if a format is found vulnerable, bump its version
  constant in `src/main/sealing.js` and ship a release — old-format files then
  stop opening and all new files use the new version. (The current versions
  revoked the earlier 64-bit-fingerprint key/share formats.)

## Configuration backup

**Security → Back Up / Restore Configuration**, and `diffbro backup <path>`,
write a single passphrase-encrypted (`scrypt` + AES-256-GCM) file containing your
identity keypair, trusted hosts, snippet library, kept saved diffs, and settings.
The private identity key is read and written only in the main process and only
leaves it inside the encrypted blob.

Contents are decrypted and re-sealed under your passphrase rather than copied as
ciphertext, which is what makes the archive restorable on another machine — the
vault key never travels, and the passphrase is the only thing that opens the
file. **Expiring diffs are left out**: the reader asked them to die, and
restoring one months later would quietly undo that.

`diffbro backup` writes the same envelope inside a zip. The destination is a
path typed into a shell, so it is refused rather than trusted — a directory, a
missing parent, an existing file, or anywhere inside the app's own data
directory (`backupZip.checkDestination`).

## Snippets

The snippet library is encrypted at rest with the same vault key (no expiry). A
snippet can be dragged into the diff pane to be compared; a **secret** one
cannot, for the same reason it has no image export — the mask exists so the
plaintext is not on screen, and a diff pane is the largest screen there is. Only
the snippet's id rides the drag, never its body, so a drop target outside the app
cannot read it. A
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
