# How a sealed diff travels

What actually happens between "Share as sealed file" and "opened, from Ada" —
and which step catches which kind of tampering.

Source of truth: `src/main/sealing.js` (`sealEntry`, `openSealed`),
`src/main/shareExport.js` (the write), `src/main/share.js` (`openSharedFileAt`).
The invariants below are hard rule 5 in [standards.md](standards.md#hard-security-rules-non-negotiable).

## The exchange

Nothing is sent. Diff Bro writes a file; you move it however you like.

```mermaid
sequenceDiagram
    autonumber
    actor Ada as Ada (sender)
    participant AdaApp as Ada's Diff Bro
    participant File as sealed.diffbro
    participant BobApp as Bob's Diff Bro
    actor Bob as Bob (recipient)

    Note over Ada,Bob: Before anything can be sealed, the two swap PUBLIC keys once.
    Bob->>BobApp: Copy my key
    BobApp-->>Bob: dbk1:… (sign + box public keys)
    Bob-->>Ada: the key, by any channel
    Ada->>AdaApp: Add trusted key, name it "Bob"
    AdaApp->>AdaApp: recompute fingerprint from the key material
    Note right of AdaApp: The fingerprint is never trusted<br/>as written in the file.

    Ada->>AdaApp: Share a saved diff, tick Bob
    AdaApp->>AdaApp: seal (see below)
    AdaApp->>File: write, filename = SHA-256(ciphertext) truncated to 32 hex
    File-->>Bob: email attachment, USB, chat — Diff Bro never sends
    Bob->>BobApp: Import
    BobApp->>BobApp: open + verify (see below)
    alt every check passes
        BobApp-->>Bob: opens, labelled "from Ada"
    else any check fails
        BobApp-->>Bob: refused, with the reason
    end
```

## Sealing — sign, then encrypt

The order matters: the signature is made over the plaintext and then encrypted
with it, so the fact that Ada signed it is not visible to anyone who cannot
already open the file.

```mermaid
flowchart TD
    Entry["The saved diff<br/>left, right, name, tags, createdAt, expiresAt"]
    TTL{"expiresAt within<br/>MAX_TTL_MS (1 week)?"}
    Aud["<b>audience</b> = first 32 hex of SHA-256 over the<br/>sorted, de-duplicated recipient fingerprints"]
    Sig["<b>sign</b> Ed25519 over payload ‖ audience"]
    Inner["inner = { payload, signer, signature }"]
    CEK["fresh random content key (CEK)"]
    Enc["<b>encrypt</b> inner, AES-256-GCM<br/>AAD = format ‖ audience"]
    Eph["fresh X25519 ephemeral keypair"]
    Wrap["for EACH recipient:<br/>ECDH(eph, their box key) → HKDF → wrap the CEK<br/>AAD = format ‖ their fingerprint ‖ audience"]
    Out["sealed file<br/>to[] · epk · keys[] · iv · tag · ciphertext"]
    Name["written as &lt;first 32 hex of SHA-256(ciphertext)&gt;.diffbro"]

    Entry --> TTL
    TTL -- no --> Refuse["refused before signing —<br/>never sign a window a reader will reject"]
    TTL -- yes --> Aud --> Sig --> Inner --> Enc
    CEK --> Enc
    Eph --> Wrap
    CEK --> Wrap
    Enc --> Out
    Wrap --> Out
    Out --> Name
```

**Why the audience is in three places.** It is committed to by the signature,
by the content AAD, and by every wrapped key's AAD. That is what stops a sealed
file being re-addressed: edit `to[]` and all three stop matching at once. A
single recipient is just an audience of one.

## Opening — four independent gates

Bob's app answers a different question at each step, and stops at the first no.

```mermaid
flowchart TD
    F["sealed.diffbro"] --> G0{"filename still the<br/>ciphertext digest?"}
    G0 -- no --> Renamed(["<b>renamed</b><br/>the file is not the one that was sealed"])
    G0 -- yes --> G1{"my fingerprint<br/>in to[] and keys[]?"}
    G1 -- no --> NotMine(["<b>not-for-you</b><br/>sealed for someone else"])
    G1 -- yes --> Recompute["recompute audience<br/>FROM the to[] the file carries"]
    Recompute --> G2{"unwrap my key, then the content<br/>both GCM tags valid?"}
    G2 -- no --> Tampered(["<b>tampered</b><br/>content OR recipient list edited"])
    G2 -- yes --> G3{"signer fingerprint in<br/>MY trusted keys?"}
    G3 -- no --> Unknown(["<b>unknown-signer</b><br/>opens for nobody it cannot name"])
    G3 -- yes --> G4{"Ed25519 verify with the key<br/>from MY trust store"}
    G4 -- no --> BadSig(["<b>bad-signature</b><br/>not written by who it claims"])
    G4 -- yes --> G5{"still inside its<br/>expiry window?"}
    G5 -- no --> Expired(["<b>expired</b><br/>enforced again on this side"])
    G5 -- yes --> Ok(["<b>opens</b> — 'from Ada'"])
```

Two details that are easy to get wrong, and are the reason this is written down:

- **The audience is recomputed from the file, never read from it.** If an
  attacker adds their own fingerprint to `to[]`, the recomputed digest changes,
  and both AAD layers fail — so the edit surfaces as `tampered` rather than
  being taken at face value.
- **The verifying key comes from Bob's trust store, not from the file.** The
  file names a signer; Bob looks that fingerprint up locally and verifies with
  the key _he_ holds. A file carrying its own verifying key would let anyone
  claim to be anyone. (`snippetSealing.js` had exactly that bug — see PR #26.)

## What this does and does not promise

|                                  |                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A third party cannot read it     | ✅ only a ticked recipient's private key unwraps the content key                                                   |
| Undetected edits                 | ✅ two AES-GCM tags; any change to content or recipients fails one                                                 |
| Undetected re-addressing         | ✅ the audience is bound into the signature and both AAD layers                                                    |
| Undetected forgery of the sender | ✅ verified against the key in _your_ trust store                                                                  |
| A renamed file                   | ✅ refused — the filename IS the ciphertext digest                                                                 |
| Expiry honoured                  | ✅ enforced when sealing and again when opening, capped at one week                                                |
| **Replay**                       | ❌ **by design.** A `.diffbro` can be opened as many times as it is kept. The expiry ceiling IS the replay window. |
| **Recall**                       | ❌ removing a trusted key does not reach a file already on someone's machine                                       |
| **Who else received it**         | ⚠️ `to[]` is readable by anyone holding the file — the recipient set is authenticated, not secret                  |

## After a key rotation

Retired keys **decrypt only**. Rotation must never orphan a diff already in
flight, so every identity this machine has ever held stays in the decrypt set;
nothing is ever signed or sealed with a retired one.

```mermaid
flowchart LR
    In["sealed for Bob's OLD key"] --> Try
    subgraph Try["openSealedWith — current first, then retired"]
        direction TB
        Cur["current identity"] -->|not-for-you| Ret["retired identity"]
    end
    Try --> Ok(["opens"])
    Note["Destroying retired keys is a<br/>separate, deliberate step —<br/>and it does orphan them."] -.-> Try
```

Guarded by `e2e/key-rotation.spec.mjs`, which seals across two profiles, rotates,
and then opens — the only shape that catches a decrypt set losing its retired
keys.
