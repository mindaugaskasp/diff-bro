# Key exchange, both directions — email my key out, take theirs off the clipboard

|                                         |                                                   |
| --------------------------------------- | ------------------------------------------------- |
| **Status**                              | shipped                                           |
| **Progress**                            | 10 / 10 steps                                     |
| **Branch**                              | `feat/email-my-key`                               |
| **Started**                             | 2026-08-09                                        |
| **Finished**                            | 2026-08-09                                        |
| **Bugs found and fixed this iteration** | 2 / 2                                             |
| **Token baseline**                      | 2026-08-09T16:38:13Z                              |
| **Claude tokens used**                  | 53,901,694 (measured; cache read 53.8M dominates) |

## Problem

Setting up sharing starts with the key swap, and the swap's first half is
manual in the worst way: **My key** (`KeyActions.vue:14-20` →
`ShareKeyDialog.vue`) offers _Save to file_ and _Copy to clipboard_ — then the
user leaves the app, opens their mail client, starts a message, and attaches
or pastes by hand. The app already knows how to do this walk for a sealed
diff: `src/main/mail.js` opens an addressed draft, puts the file on the
clipboard, and reveals it as the fallback. The key — the thing you send
_before_ any diff can travel — never got the same path.

The receive half has the mirror-image gap: **+ Trusted key** goes straight to
a file picker (`share.js:322-325`), but a key that arrived through Slack or a
chat message is text on the clipboard, not a file — the user has to save it
somewhere just to pick it again. And any clipboard route must confirm, never
silently trust: the existing `AddTrustedKeyDialog` already IS that check
(fingerprint, label, vouch, an explicit Add), so the clipboard path must land
in it like every other path does.

## Solution

A third action in ShareKeyDialog — **Email it** — that reuses the shipped
mail hand-off, key-flavoured:

1. Main writes `my-key.diffbrokey` (the existing public-key export, same
   bytes as _Save to file_) into the clipboard staging dir and puts it on the
   clipboard as a file (`copyPathToClipboard` — the paste-into-the-message
   route the diff flow ships).
2. Main builds a **recipient-less** `mailto:?subject=…&body=…` draft: subject
   carries the key's label, body carries the paste instruction, the import
   path (Security → Add Trusted Key) and the **fingerprint** — the
   out-of-band verification channel is the whole reason the body exists.
3. Confirm dialog (same as the diff flow's), then `shell.openExternal`
   through `isSafeMailtoUrl`, then reveal-as-fallback honouring the existing
   Settings → Email reveal toggle. `no-mail-app` degrades identically to the
   diff flow: file on clipboard + revealed, error reported.

Recipient-less is the point: you email your key precisely to someone who is
**not yet** in your trust store, so there is no address to resolve — the user
addresses the draft in their own client. `buildMailto` today refuses an empty
`to`; the key flow gets an explicit opt-in rather than a loosened default.

**And the receive half — a key from the clipboard:**

4. **+ Trusted key** first PEEKS the clipboard **in main**
   (`clipboard.readText()` — the renderer never supplies the content): strip
   chat wrapping (code fences, smart quotes, whitespace), cap the size
   BEFORE parsing, then run the text through the same validator the file
   route uses — shape check, **fingerprint recomputed from the key
   material** (the text's own claimed fingerprint is never trusted),
   own-key refusal, vouch resolution from the local trust store.
5. A valid clipboard key opens the existing `AddTrustedKeyDialog` marked
   with its source — "From your clipboard" — showing the recomputed
   fingerprint and offering _Choose a file instead…_; nothing is ever added
   without that dialog's explicit Add. Invalid or absent clipboard text
   falls straight through to today's file picker, silently.

| option                                         | why not                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Attach the key via `mailto:` `attach=`         | refused by design (`linkPolicy.isSafeMailtoUrl`) — the parameter is a local-file-read vector; the clipboard route is the shipped answer     |
| Recipient picker over trusted keys             | backwards: the swap happens BEFORE trust exists; a picker would offer exactly the people who already have the key                           |
| Paste the key text into the mailto body        | a `.diffbrokey` is JSON with a signature — clients wrap/mangle body text, and `MAX_MAILTO_LENGTH` (4000) is too small anyway                |
| A separate compose dialog like the diff flow's | the diff compose exists to pick recipients + note; this flow has neither — one confirm dialog is the whole interaction                      |
| Silently trusting a parsed clipboard key       | the confirm dialog is the entire security story of trusting a key — the clipboard arrives from ANY app and deserves more scrutiny, not less |
| A paste textarea inside AddTrustedKeyDialog    | reading in main keeps renderer input out of the trust path entirely, and the peek makes the common case zero-typing                         |

## Scope

**In:**

1. `mailto.js`: `buildMailto` accepts `allowEmptyTo` (explicit, never
   default); `keyMessage({ label, fingerprint })` builds subject/body as a
   pure, unit-tested function.
2. `linkPolicy.isSafeMailtoUrl`: accepts a recipient-less `mailto:` (still
   refuses `attach`/`attachment`, control chars, length, non-mailto — tests
   for each).
3. `mail.js`: `mail:keyHandoff` IPC — label in (capped, header-cleaned),
   description of what happened out; stages the key file, clipboard, confirm,
   openExternal, reveal fallback. Reuses `setOsHooksForTests`.
4. ShareKeyDialog: **Email it** button (plain `.btn` beside the existing
   two); result notice mirrors `runExportKey`'s voice.
5. Preload: `emailKey` bridge.
6. Unit tests (mailto/linkPolicy/mail core) + e2e in
   `email-handoff.spec.mjs`'s stubbed-OS style: captured URL is recipient-less
   mailto with fingerprint in the body and no `attach`; staged `.diffbrokey`
   parses and its fingerprint matches; no-mail-app degradation.
7. i18n catalogue entries + pseudolocale.
8. Trusted-key clipboard route: main peek + validate
   (`share:addTrustedKeyFromClipboard`), source-labelled
   `AddTrustedKeyDialog` variant with _Choose a file instead…_, fall-through
   to the picker when the clipboard holds no key.
9. Docs: README Share row gains "or email it" / "or paste it from any app";
   `docs/security.md` email section notes the key flow rides the same fence.

**Out** _(recorded)_:

- Prefilling a recipient from a trusted key that has an email — the swap's
  reply half, worth doing only if asked.
- Watching the clipboard in the background or auto-prompting on copy — the
  peek happens only when the user presses + Trusted key.
- Any change to the private key, rotation, or trust-store surfaces.
- SMTP anything — settled by `specs/2026-08-04-email-sharing`.

## Design

No new visual surface: one more `.btn` in an existing `BaseDialog` action row
(quiet beside the `.btn-primary`, per the control rules) and a notice through
the existing channel. Theme table omitted per the template's rule — nothing
here composes a new colour pair; the dialog chrome is BaseDialog's.

## Security rules touched

- **Rule 1 (offline)** — untouched: the app still sends nothing; `mail.js`
  opens no socket (the file's own header grep stays empty).
- **Rule 4 (keys)** — the PUBLIC key only, through the existing export path;
  it is the artifact designed to leave the machine. The private key stays
  behind `safeStorage`; no new surface returns key material to the renderer.
- **Rule 7 (sandbox exits)** — no new `openExternal` call site: the key flow
  goes through `mail.js`'s existing one, URL built in MAIN from validated
  parts, checked by `isSafeMailtoUrl` on the way out; `attach` still refused;
  the renderer supplies a label string, never a URL, address or path. The
  staged path never round-trips through the renderer. Recipient-less is
  _less_ input than the diff flow, not more.
- **Rule 6 (hostile input)** — label capped + `headerText`-cleaned before it
  enters the subject. The clipboard is the most hostile input of all (any app
  writes it): size-capped before parse, shape-validated, fingerprint
  recomputed, own-key refused, and the SAME confirm dialog gates it that
  gates a picked file — there is no silent-add path.
- Rules 2, 3, 5, 8 — no new dependency, no renderer Node, no crypto change
  (the key file is the existing signed export), no render sinks.

## Test plan

- **unit** — `tests/main/mailto.test.js`: empty-`to` refused by default,
  allowed with the flag, encoding unchanged; `keyMessage` carries label +
  fingerprint, survives hostile labels. `tests/main/linkPolicy.test.js`:
  recipient-less accepted, `attach` still refused there too.
  `tests/main/mail.test.js` (or the existing seam's home): keyHandoff
  happy path, canceled, `no-mail-app` — each asserting the staged file
  outlives the failure and is reported.
- **unit (clipboard route)** — validator core: chat-wrapped key parses;
  oversized text refused before parse; tampered key material fails the
  recomputed fingerprint; own key refused; garbage falls through to
  `no-key`.
- **e2e** — extend `e2e/email-handoff.spec.mjs`: stub OS hooks, click My key
  → Email it, assert the captured URL and the staged file's content +
  fingerprint; relaunch sweep must not orphan it unpruned (staging dir's
  existing 30-minute rule covers it — assert it lands there). Clipboard
  route: copy a real exported key, press + Trusted key, the confirm dialog
  shows the RECOMPUTED fingerprint and "From your clipboard"; Add lands it
  in the trust store; with junk on the clipboard the file picker opens
  instead (stubbed).
- **red → green** — each new behaviour watched failing first, per the rule.
- **seed fixtures** — none.

## Docs impact

| surface                  | needed? | what changes                                                                  |
| ------------------------ | ------- | ----------------------------------------------------------------------------- |
| `README.md`              | yes     | Share row: "…or email it — your mail app opens with the key on the clipboard" |
| `docs/screenshots/*.png` | no      | no captured state shows the ShareKey dialog                                   |
| `docs/roadmap.md` + svg  | no      | no track touches key exchange                                                 |
| `docs/security.md`       | yes     | one line: the key email rides the same mailto fence as the diff               |

## Implementation plan

- [x] 1. `keyMessage` + `allowEmptyTo` in `mailto.js`, unit red → green.
- [x] 2. `isSafeMailtoUrl` recipient-less acceptance, unit red → green
      (attach-refusal tests re-asserted beside it).
- [x] 3. `mail.js` `mail:keyHandoff` (stage → clipboard → confirm →
      openExternal → reveal), core kept testable, unit red → green.
- [x] 4. Preload bridge + `shareStore.runEmailKey` + ShareKeyDialog button.
- [x] 5. i18n entries, pseudolocale, `check:i18n`/`check:rawtext` clean.
- [x] 6. Clipboard validator core in the testable half of the key path,
      unit red → green (wrapping, cap, tamper, own-key, junk).
- [x] 7. `share:addTrustedKeyFromClipboard` + peek-first flow +
      AddTrustedKeyDialog source variant with _Choose a file instead…_.
- [x] 8. e2e extensions (both flows), red → green.
- [x] 9. Docs (README, security.md).
- [x] 10. `/validate`; `npm run check`; e2e; Validation + tokens filled.

## Decisions

| date       | decision                                        | why                                                                                       | rejected                     |
| ---------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| 2026-08-09 | Recipient-less draft, explicit `allowEmptyTo`   | the swap targets people outside the trust store                                           | picker; loosened default     |
| 2026-08-09 | Key file via clipboard staging, not Save-dialog | matches the diff hand-off's paste-into-message route                                      | attach param (refused)       |
| 2026-08-09 | Clipboard peek only on + Trusted key, in main   | zero-typing common case with no background watching; renderer stays out of the trust path | paste box; clipboard polling |

## Validation

- [x] `/validate` — prose comments terse, conventions held (pure `keyText.js`
      core / thin `keyExchange.js` glue; `keyExchangeActions` spread keeps
      shareStore at 225 of 250; every function under its caps), security pass
      recorded in `quality-audit.md`. Two defects found and fixed red→green
      during the build: the staged-key e2e read the envelope as raw JSON
      (decodePublicKey is the codec), and the clipboard peek made three
      pre-existing sharing tests clipboard-order-dependent (they now clear it —
      the file path is what they test).
- [x] `npm run check` — 3032 passed / 2 skipped; coverage 95.29 / 88.34 /
      95.70 / 96.28 over 93 / 86 / 92 / 95 floors; theme depth ok (20);
      i18n 1216/1216; raw text 0; `share.js` fn ratchet retightened 224→205
      (the vouchedBy extraction shrank it).
- [x] e2e — `email-handoff.spec.mjs` 8/8 (both new flows: unaddressed draft
      with recomputed fingerprint + staged parseable key; clipboard offer →
      verify → add → trust store, junk → picker, choose-file-instead);
      `sharing` / `trusted-keys` / `sealed-recipients` 16/16; `smoke` +
      `key-rotation` 12/12.
- [x] Docs-impact "yes" rows done: README Share row, `docs/security.md`
      key-swap paragraph.
- [x] token usage measured, header row filled.

### Token usage

86 requests, 2026-08-09T16:38→17:05 (approx), one session, this build only.

| category    |         tokens |
| ----------- | -------------: |
| input       |            172 |
| output      |         52,607 |
| cache write |         84,451 |
| cache read  |     53,764,464 |
| **total**   | **53,901,694** |

**Outcome:** both directions of the key swap shipped — Email it (unaddressed
draft, key staged for pasting, fingerprint in the body) and clipboard import
(peek in main, recomputed fingerprint, the same confirm dialog gating every
path). No new dependency, no new sandbox exit, no crypto change.
