# Share keys, diffs and snippets with DiffBro on the same network

|                                         |                                                              |
| --------------------------------------- | ------------------------------------------------------------ |
| **Status**                              | in-progress (plan approved 2026-11-17)                       |
| **Progress**                            | 3 / 44 steps                                                 |
| **Branch**                              | stack of `feat/lan-*` slices, see Delivery                   |
| **Started**                             | 2026-11-17                                                   |
| **Finished**                            | —                                                            |
| **Bugs found and fixed this iteration** | 0 / 0                                                        |
| **Token baseline**                      | 2026-11-17T12:15:23Z                                         |
| **Claude tokens used**                  | not measured                                                 |
| **Issue**                               | [#243](https://github.com/mindaugaskasp/diff-bro/issues/243) |

## Problem

Colleagues on the same office network who want to hand each other a diff or a
snippet today have to export a `.diffbro`, move the file by chat, mail or a
share, and import it on the other side. The first exchange is worse: each side
exports a `.diffbrokey`, sends it, and imports the other's
(`src/main/trustedKeys.js` `storeTrusted`, `src/main/keyExchange.js`). Nothing
in DiffBro can reach another DiffBro directly, by design: hard rule 1 holds
"because nothing in main opens a socket" (`docs/standards.md`).

## Solution

DiffBro instances on the same local network find each other (mDNS/DNS-SD over
`dgram`) and talk over one fenced TCP listener in `src/main/lan/`.

- **Adding someone:** the adder clicks Add. The other person's screen shows a
  one-time pairing code with a countdown, and the adder types or pastes it. A
  match stores the other person's **public** key exactly as a `.diffbrokey`
  import does.
- **Sending:** the Share dialog gains **Send now**. Main seals with the
  existing `sealEntry` / `sealSnippets` and sends the sealed bytes.
- **Receiving:** the recipient gets a dialog (Decline / Open), queued
  "1 of 3". Open runs the existing `openSealed` checks on the bytes in memory.
- **Notifications:** popups can be silenced. Anything silenced or dismissed
  waits under a bell beside the gear, as sealed bytes on disk until the
  sender's expiry.
- **Stop sharing** removes the key, deletes unopened items, and tells the other
  side with a notice signed by your key.

Encryption is unchanged: the wire carries the `diffbro-share/4` /
`diffbro-snippets/1` envelopes already written to disk. `sealing.js` is not
touched.

**This amends hard rule 1.** Main opens a multicast socket and a listener
whenever the feature is on, which is from first launch. The maintainer
accepted that on 2026-11-17. `installNetworkKillSwitch` filters Chromium
traffic only, so the fence is new and explicit (see Security rules touched).

| option                                                    | why not                                                                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared-folder drop box (SMB/NFS share watched by DiffBro) | keeps rule 1 intact; the maintainer chose direct LAN sharing                                                                                                     |
| Sendbird or any hosted relay                              | cloud account and outbound traffic: breaks rules 1 and 2                                                                                                         |
| `multicast-dns` / `bonjour-service`                       | network-only and small, but a transitive tree for a subset (announce one service, browse one type) that is ~200 lines over `dgram`; rule 2 surface stays at zero |
| TLS on the wire                                           | items are already signed-then-encrypted to the audience; for pairing neither side has a cert the other trusts, and the code is the authentication                |
| Code shortened from the fingerprint                       | 6 characters could be ground out by generating keys; commit-then-reveal makes it one guess                                                                       |
| Connect by IP, store-and-forward                          | remove the "same network" fence                                                                                                                                  |
| Off by default                                            | the maintainer chose on by default                                                                                                                               |

## Scope

**In:** discovery and presence; the add flow with the pairing code (copy,
paste, countdown, wrong, expired, cancelled, connection lost); Send now for
diffs and snippets; receiving with a queued dialog; Silence for ▾; the bell
and its list; Stop sharing with a signed notice; Settings ▸ Integrations ▸
Network; the offline and no-network states; the rule 1 amendment in
standards, security docs and README; the existing destructive-button contrast
defect (it is the Stop sharing button).

**Out:**

- secret snippets, which are never sent;
- VPN or cross-subnet discovery;
- connect by IP;
- delivery or read receipts beyond "Sent";
- a shortcut for the bell (View ▸ Notifications only);
- sending to several people across networks;
- Windows firewall rule installation (the OS prompt is accepted).

## Design

**Source of truth:** <https://claude.ai/artifact/VmdnGgkCUQbRmJfRnQdVRG>.
**Approved design:** its launch page, signed off by the maintainer on
2026-11-17. It shows 34 states rendered on the live app in Docker (macOS
emulated), each in light and dark, plus the bell list on all 20 themes. The
Exploration page keeps the options that were not chosen.

| section                   | boards                                                                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding someone            | Pairing code field with Paste · clipboard holds no code · adder typed it · other screen: Share this code + countdown · hover: Click to copy · ✓ Copied · "Add them too?" · Code didn't match · Code expired (both sides) · Request cancelled · Connection lost |
| Receiving                 | item dialog, 1 of 3, Silence for ▾ · the Silence menu (1/5/10/30 min, 1 h, 1 day, Forever) · X: all go under the bell · opened in a tab under the received band                                                                                                |
| The bell                  | count beside the gear · Notification Center cards, actions on hover · Nothing waiting · silenced (crossed-out bell) · popups off · 20-theme grid                                                                                                               |
| Sending                   | Send now; offline people disabled · Sending… · Sent · Couldn't send · picked person drops off · no network · sharing on the network off (today's dialog)                                                                                                       |
| Settings and stop sharing | Network page · no network · turned off · Stop sharing confirm · row offers Add · told on the other screen                                                                                                                                                      |

**Token mapping** (all through tokens, nothing literal):

- **Dialogs:** `BaseDialog`; the code box is 8% `--text` on `--bg-raised` in
  `--font-mono`. Hovered it is 13%; copied it is 14% `--accent` with an
  `--accent` 55% edge and `--accent-ink` for the label.
- **Glyphs:** `.glyph-well[data-hue=received]`.
- **Opened-item band:** the `ProposalBar` band. `--hue-received` 10% on
  `--bg`, with a 70% `--hue-received`/`--text` rule.
- **Bell list:**
  - the panel is `.popover` on `--bg-canvas`, with `--dialog-edge`,
    `--shadow-3` and an inset 14% `--text` hairline;
  - cards are `--bg-raised`, with `--shadow-1`, an inset 9% `--text` hairline
    and `--tile-edge` on the keyline themes;
  - the hovered card is a 5% `--text` wash;
  - actions are plain `.btn-sm`, and names are weight 500.
- **Bell badge:** `--accent` with `--text-on-accent`.
- **Silence menu:** `.popover` / `.popover-row` / `.popover-why`.
- **Recipient rows:** `.row-2`. Offline rows are disabled at 0.5 opacity;
  the "On your network" dot is `--accent`.
- **Settings page:** the real `SettingToggle` and nav, with `--field-face` /
  `--field-edge` for the name.
- **Buttons:** Decline, Cancel and Close are `.btn-ghost`. Add, Open,
  Send now and Try again are `.btn-primary`. Stop sharing is
  `.btn-destructive`.

New tokens (in `tokens.css`, held by the theme guard): `--hairline`
(color-mix 14% `--text`), `--hairline-soft` (9%).

### Theme verdict — all 20

Contrast computed from parsed `themes.css` values (card text, `--text-meta`,
code text, glyph on well, primary label on accent), then checked on the live
app for the bell list.

| theme    | ground | verdict        | note                                                                 |
| -------- | ------ | -------------- | -------------------------------------------------------------------- |
| light    | light  | pass after fix | floating-canvas inversion; destructive label 3.35 → fixed in slice 2 |
| dark     | dark   | pass after fix | hairline carries the edge; destructive label 3.35 → fixed in slice 2 |
| solar    | light  | pass           | primary label 4.5 exactly (existing `.btn-primary`)                  |
| neon     | dark   | pass           | accent `#22d3ee`: no accent glow used anywhere                       |
| nord     | dark   | pass after fix | destructive label 3.55 → fixed in slice 2                            |
| sepia    | light  | pass           | meta 5.4                                                             |
| dim      | dark   | pass           |                                                                      |
| beacon   | dark   | pass           | hard keyline `#e0e0e0` kept on dialog and cards                      |
| meridian | light  | pass           | primary label 4.5 exactly (existing)                                 |
| linen    | light  | pass           |                                                                      |
| bloom    | light  | pass           |                                                                      |
| nyan     | dark   | pass           | accent `#ff2ecb`: no glow                                            |
| matrix   | dark   | pass           | accent `#00ff41`: no glow                                            |
| contrast | light  | pass           | hard keyline `#111111` kept                                          |
| volcano  | dark   | pass           | dialog keyline kept                                                  |
| amber    | dark   | pass           |                                                                      |
| tide     | dark   | pass           |                                                                      |
| ember    | dark   | pass           |                                                                      |
| graphite | dark   | pass           | hairline carries the edge                                            |
| vector   | light  | pass           |                                                                      |

## Protocol

**Pairing code.** Six characters from `23456789ABCDEFGHJKMNPQRSTVWXYZ`, shown
as `K7Q 4ZP`.

```text
1. adder  → holder  add-request: adder public key, name, commit = SHA-256(nonceA)
2. holder → adder   add-reply:   holder public key, name, nonceH
3. adder  → holder  add-reveal:  nonceA          (holder checks the commit)
both:  code = base30( SHA-256(fpHolder ‖ fpAdder ‖ nonceH ‖ nonceA) )[0..6]
holder shows it; adder types it; adder's main compares with timingSafeEqual
adder → holder  add-result: matched | mismatched | cancelled
```

The adder commits before seeing the holder's nonce, so a man in the middle
gets one guess per request (about 1 in 729 million), and one try means no
second guess. Nonces and the code live in main memory for the request only.

**Discovery.** DNS-SD over mDNS (`224.0.0.251` / `ff02::fb`, port 5353, TTL
1). The service is `_diffbro._tcp.local`. TXT carries `v=1`, `name`, `fp` (the
fingerprint) and `port`, and never an email or a key. Show me to others off
stops announcing; browsing continues so trusted people still appear.

**Frames.** One frame per TCP connection: a 4-byte length, a JSON header and an
optional body. Every frame is size-checked before it is read.

| frame                                                     | carries                                             | cap   |
| --------------------------------------------------------- | --------------------------------------------------- | ----- |
| `add-request` / `add-reply` / `add-reveal` / `add-result` | public key (`dbk1:`), name, commit or nonce, result | 8 KB  |
| `item`                                                    | kind, name, sealed envelope                         | 25 MB |
| `revoke`                                                  | revoker fingerprint, time, signature                | 1 KB  |

**Fences.**

1. Sockets live only in `src/main/lan/`, enforced by lint.
2. Binding is to private interface addresses only, never `0.0.0.0`.
3. The source address is checked before the first byte.
4. An `item` is accepted only from a trusted fingerprint, and is dropped
   without a prompt otherwise.
5. Off closes the listener and stops announcing in the same tick.
6. The renderer names fingerprints, never addresses.
7. Caps, shape checks, recomputed fingerprints and per-peer rate limits apply
   throughout.

## Security rules touched

| rule              | effect                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 offline         | **amended.** Main opens a multicast socket and one listener while Share on this network is on (default on). `net`/`dgram` are lint-banned outside `src/main/lan/`. The listener binds to private interface addresses only, never `0.0.0.0`; multicast TTL is 1; the source address is checked (RFC 1918, link-local, ULA) before the first byte is read. Off closes both in the same tick. standards.md, security.md and README are rewritten to say so. |
| 2 dependencies    | none added; DNS-SD is in-repo, and the reason is a comment at `lan/dnsSd.js`                                                                                                                                                                                                                                                                                                                                                                             |
| 3 renderer split  | all sockets and clipboard reads in main; the renderer sees `window.api.lan*` and names fingerprints, never addresses                                                                                                                                                                                                                                                                                                                                     |
| 4 keys            | only public keys travel; pairing nonces never leave main; the code is never stored                                                                                                                                                                                                                                                                                                                                                                       |
| 5 crypto          | `sealing.js` untouched. The `revoke` frame is signed with the identity key and verified against the trust store. Sender expiry is capped by `MAX_TTL_MS` on both sides as today                                                                                                                                                                                                                                                                          |
| 6 untrusted input | every frame has a declared size checked before reading, shape validation, a recomputed fingerprint and a per-peer rate limit; items only from trusted keys; inbox capped at 50                                                                                                                                                                                                                                                                           |
| 7 sandbox exits   | none added                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 8 injection       | names and host names render through text interpolation only                                                                                                                                                                                                                                                                                                                                                                                              |

Threats and answers:

- **Impersonation on first contact:** the pairing code, one guess per request.
- **Prompt spam:** one add request per requester per minute and one open at a
  time; nothing from untrusted keys for items.
- **Forged revoke:** signed.
- **Presence leak:** Show me to others off.
- **Large payload:** a size cap checked before reading.
- **EDR flagging a listener:** documented with the port and service type.

## Test plan

- **unit**, mirroring paths under `tests/main/lan/`:
  - `pairingCode.test.js`:
    - commit/reveal;
    - alphabet and length;
    - both sides derive the same code;
    - a tampered nonce or commit fails;
    - comparison is constant-time (`timingSafeEqual`).
  - `frames.test.js`:
    - encode/decode;
    - the declared-size cap is refused before reading;
    - unknown type, bad shape and an oversized key are refused;
    - fingerprints are recomputed.
  - `privateAddress.test.js`: RFC 1918, link-local, ULA and loopback accepted;
    public v4/v6 refused; v4-mapped v6.
  - `dnsSd.test.js`: announce and query packets round-trip; captured packets
    from macOS, Windows and Avahi decode; malformed and compressed-loop packets
    are refused.
  - `peers.test.js`: the discovery table (add, refresh, expire, hidden) and the
    renderer view without addresses.
  - `offers.test.js`: per-peer rate limit; one open add request; 2-minute
    expiry; 10-minute popup expiry; queue order; X moves everything to the
    inbox.
  - `lanInbox.test.js`: write and read sealed bytes; cap 50; expiry from the
    sealed TTL; deleting by sender on revoke.
  - `revoke.test.js`: sign and verify; an unknown signer, a tampered body and a
    replay older than a week are refused.
  - `lanSettings.test.js`: defaults (on, visible, popups on, name = computer
    name), silence-until arithmetic, Forever = popups off.
  - `tests/renderer/features/lan/`:
    - `lanStore.test.js`: peers, availability and the queue;
    - `useCopyCode.test.js` and `usePasteCode.test.js`: normalising pasted
      text;
    - `shareAvailability.test.js`: offline rows disabled, dropped picks
      unticked, LAN off = today.
- **e2e** (Linux in Docker; two Electron instances on the container network,
  each with its own user-data dir):
  - `lan-discovery.spec.mjs`: each sees the other; switching off closes the
    port (a connect is refused) and the peer vanishes from the other's list.
  - `lan-pairing.spec.mjs`:
    - read the code from B's dialog, type it on A: trusted on A;
    - "Add them too?" on B;
    - wrong code → Code didn't match on both sides;
    - expiry, by injecting the clock through the e2e flag the app already
      honours for timers, or skipped if none exists (see step 13);
    - cancel → Request cancelled.
  - `lan-send.spec.mjs`:
    - snippet A → B, Open, then the band shows;
    - diff A → B;
    - X → bell count 1;
    - open from the bell;
    - an offline row is disabled.
  - `lan-silence.spec.mjs`: Silence for 1 minute → no popup and the bell
    counts; Forever unticks Show popups.
  - `lan-stop-sharing.spec.mjs`: A stops sharing; B is told; B's send to A
    fails; B's waiting items are deleted on A.
- **red → green:** the destructive-contrast fix starts as a failing
  `check:themes` floor (label on `--danger-bg` ≥ 4.5 on light, dark, nord).
  Every bug found during the build gets its failing test first; failures are
  recorded in Decisions.
- **seed fixtures:** none. No new file format; `seed-local.mjs` unchanged.
- **theme sweep:** add `SURFACES` probes for the code box (rest, hover,
  copied), the bell list card and hairline, the bell badge, and the disabled
  recipient row.

## Docs impact

| surface                  | needed? | what changes                                                                                                                                                                                                             |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`              | yes     | lines 12 and 62 ("not one network request", "no network requests on its own") rewritten; a LAN sharing row in features                                                                                                   |
| `docs/screenshots/*.png` | no      | no captured state changes: `empty-state`, the diffs and `save-encrypted` show none of the new surfaces (the bell shows only with items or silence)                                                                       |
| `docs/roadmap.md`        | yes     | LAN sharing as a new track, Done.                                                                                                                                                                                        |
| `docs/brand/roadmap.svg` | yes     | same move                                                                                                                                                                                                                |
| `docs/*.md`              | yes     | `standards.md` rule 1 amended; `security.md` network section (what is open, port, service type, how to turn off); `ipc-security.md` new `lan:*` channels; `glossary.md` (LAN, mDNS, DNS-SD, pairing code, commit-reveal) |
| `docs/features.md`       | yes     | the feature, with its states                                                                                                                                                                                             |
| `docs/architecture.md`   | yes     | the `src/main/lan/` module and its fences                                                                                                                                                                                |

## Delivery

One PR per design change, stacked with git-spice. Slice 1 targets `main`;
each later slice targets the one below. Each is green alone and released as
one tag.

| #   | slice                                                                | branch                       | base    | PR  | status |
| --- | -------------------------------------------------------------------- | ---------------------------- | ------- | --- | ------ |
| 1   | spec, render script, canvas link                                     | `feat/lan-sharing-spec`      | `main`  |     |        |
| 2   | destructive button label ≥ 4.5 on every theme                        | `fix/danger-button-contrast` | slice 1 |     |        |
| 3   | pure cores: code, frames, addresses, DNS-SD, peers, offers, settings | `feat/lan-core`              | slice 2 |     |        |
| 4   | sockets, fence, rule 1 amendment, Network settings page, presence    | `feat/lan-transport`         | slice 3 |     |        |
| 5   | adding someone: pairing flow end to end                              | `feat/lan-pairing`           | slice 4 |     |        |
| 6   | sending and receiving items, inbox on disk                           | `feat/lan-send`              | slice 5 |     |        |
| 7   | the bell, its list, silencing                                        | `feat/lan-bell`              | slice 6 |     |        |
| 8   | stop sharing and the signed notice                                   | `feat/lan-stop-sharing`      | slice 7 |     |        |
| 9   | docs, theme sweep probes, roadmap                                    | `feat/lan-docs`              | slice 8 |     |        |

## Implementation plan

**Slice 1: spec**

- [x] 1. `git-spice repo init` if needed; create `feat/lan-sharing-spec` from `main`; record the token baseline.
- [x] 2. Port the render script to `design/render/243-lan-sharing.render.mjs`. (The design README states the convention, not a per-file list, so it needs no edit; the render draws with its own helpers because `kit.mjs` has no dialog or popover builders.)
- [x] 3. Commit plan + render script; `git-spice stack submit` opens the first PR, closing nothing yet (refs #243).

**Slice 2: destructive contrast**

- [x] 4. Failing floor in `scripts/check-theme-depth.mjs`: the `--danger-text` label on `--danger-bg` ≥ 4.5 on all 20. Watch it fail on light, dark and nord.
- [x] 5. Fix `--danger-bg` / `--danger-text` on those three in `themes.css` (darken the red, keep the hue); `npm run check` green; screenshot a delete dialog on the three.

**Slice 3: pure cores** (`src/main/lan/*`, no sockets, no Electron)

- [ ] 6. `pairingCode.js` + tests (red first).
- [ ] 7. `frames.js` (length-prefixed JSON header + body, caps, validation) + tests.
- [ ] 8. `privateAddress.js` + tests.
- [ ] 9. `dnsSd.js` (PTR/SRV/TXT/A/AAAA encode/decode for `_diffbro._tcp.local`; compression with a loop guard) + tests with captured packets in `tests/data/mdns/`.
- [ ] 10. `peers.js` (discovery table) + `offers.js` (rate limits, add-request lifecycle, popup queue) + tests.
- [ ] 11. `lanSettings.js` (defaults incl. computer name via `os.hostname()` plus macOS `scutil --get ComputerName` through `execFile`, silence arithmetic) + tests; add the files to the coverage set; the coverage floor holds.

**Slice 4: transport + Network page**

- [ ] 12. ESLint: ban `net`, `dgram`, `node:net`, `node:dgram` in `src/**` except `src/main/lan/**`; a planted import fails lint (checked, then removed).
- [ ] 13. `discovery.js` (dgram, TTL 1, private interfaces), `server.js` (net, per-interface bind, source check before read, one frame per connection), `lan.js` lifecycle (start on ready if on, stop on off/quit, restart on interface change).
- [ ] 14. `lanIpc.js`: `lan:state`, `lan:setEnabled`, `lan:setVisible`, `lan:setPopups`, `lan:setName`, `lan:peers` (event); preload `window.api.lan*`; `ipc-security.md` entries in the same slice.
- [ ] 15. Settings nav `network` page under Integrations (`settingsNav.js`); `NetworkSettings.vue` in `features/lan/` (toggles, name, people list, no network, turned off); i18n keys + pseudolocale.
- [ ] 16. Rule 1 amendment in `standards.md` + `security.md` network section (they ship with the first socket).
- [ ] 17. e2e `lan-discovery.spec.mjs`; `make e2e` green; `npm run check` green.

**Slice 5: pairing**

- [ ] 18. Main: `pairing.js` session (adder and holder roles, commit-reveal, 2-minute timer, one try, cancel, connection lost) wired to `storeTrusted`; tests.
- [ ] 19. `lan:add`, `lan:submitCode`, `lan:cancel`, `lan:pasteCode` (main reads the clipboard, returns only a code-shaped value), events `lan:pairing`.
- [ ] 20. `AddDialog.vue`, `ShowCodeDialog.vue` (click to copy via `window.api.copyText`, live countdown), result dialogs (didn't match, expired ×2, cancelled, connection lost, "Add them too?"); `usePasteCode`, `useCopyCode`, `useCountdown` composables + tests.
- [ ] 21. Add buttons on the Network page rows; e2e `lan-pairing.spec.mjs`.

**Slice 6: send and receive**

- [ ] 22. `lanInbox.js` (sealed bytes, `0o700`, cap 50, TTL from the envelope) + tests.
- [ ] 23. `lan:send` (seal with existing helpers for the picked fingerprints, refuse secret snippets in main, send, `Sent` / `Couldn't send`); receive: trusted-only, queue, popup or inbox.
- [ ] 24. Share dialog: availability from `lanStore`, offline rows disabled, live untick, Send now / Sending…; LAN off = today's dialog (`RecipientPicker` gains a `disabledFps` prop); snippet share path the same.
- [ ] 25. `ItemOfferDialog.vue` (1 of 3, Decline / Open, X → later); Open → existing open-sealed path in memory → tab with the received band (`ReceivedBar.vue`, reusing ProposalBar's CSS through a shared class).
- [ ] 26. e2e `lan-send.spec.mjs`.

**Slice 7: bell + silencing**

- [ ] 27. `NotificationBell.vue` in the toolbar beside the gear (macOS) and in the menu strip's right end (Windows/Linux), shown when items wait or popups are silenced; View ▸ Notifications in both menus (`menus.js`, `src/main/index.js`, `commands.js` row).
- [ ] 28. `NotificationList.vue` (cards, hover actions, Nothing waiting, header "3 waiting" / "Silenced until 15:40"); add `--hairline` / `--hairline-soft` to `tokens.css`.
- [ ] 29. `SilenceMenu.vue` in the item dialog; `lan:silence(minutes | 'forever')`; Forever flips Show popups.
- [ ] 30. e2e `lan-silence.spec.mjs`.

**Slice 8: stop sharing**

- [ ] 31. `revoke.js` (sign, verify, pending notice for offline peers, one per peer, a week) + tests.
- [ ] 32. `lan:stopSharing(fp)`: `removeTrusted`, delete inbox items by sender, send or queue the notice; receiver shows "… stopped sharing with you".
- [ ] 33. Stop sharing button + `.btn-destructive` confirm on the Network page; e2e `lan-stop-sharing.spec.mjs`.

**Slice 9: docs**

- [ ] 34. README lines 12 and 62 + feature row.
- [ ] 35. `docs/features.md`, `docs/architecture.md`, `docs/glossary.md`.
- [ ] 36. `docs/roadmap.md` + `docs/brand/roadmap.svg`.
- [ ] 37. `scripts/theme-sweep.mjs` `SURFACES` probes; `make theme-sweep` green on 20.

**Close**

- [ ] 38. Comment sweep on every touched file.
- [ ] 39. `/validate`; fill Validation with its real output.
- [ ] 40. `npm run check` on the top of the stack; CI green on every PR (ubuntu + windows).
- [ ] 41. Full `make e2e` in Docker.
- [ ] 42. Re-verify the share roundtrip in Docker (rule 5 asks for it whenever sharing changes, even with `sealing.js` untouched).
- [ ] 43. Built UI held against the Approved design page.
- [ ] 44. Token usage measured; Status → shipped only when every step is ticked.

## Decisions

| date       | decision                                                                                                                                                                                                                    | why                                                                                                                                                                                                                                                  | rejected                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 2026-11-17 | amend rule 1 for a fenced LAN module                                                                                                                                                                                        | the maintainer                                                                                                                                                                                                                                       | shared-folder drop box                                                   |
| 2026-11-17 | direct peer-to-peer send                                                                                                                                                                                                    | LAN-only, no account, no outbound                                                                                                                                                                                                                    | Sendbird / hosted relay                                                  |
| 2026-11-17 | the public key is what is offered                                                                                                                                                                                           | rule 4                                                                                                                                                                                                                                               | private key                                                              |
| 2026-11-17 | on by default                                                                                                                                                                                                               | the maintainer                                                                                                                                                                                                                                       | off by default, per-network prompt                                       |
| 2026-11-17 | one random 6-character pairing code per add, like 2FA; commit-then-reveal                                                                                                                                                   | short and still unforgeable                                                                                                                                                                                                                          | 6-word fingerprint code, MAC-based identity                              |
| 2026-11-17 | the adder starts it and types the code the colleague shares; no approval by the colleague                                                                                                                                   | the maintainer: typing can't be clicked through                                                                                                                                                                                                      | sender pushes their key; both screens show the code                      |
| 2026-11-17 | one try at the code                                                                                                                                                                                                         | the maintainer                                                                                                                                                                                                                                       | three tries                                                              |
| 2026-11-17 | dialogs for the add flow and for incoming items, queued "1 of 3"                                                                                                                                                            | the maintainer                                                                                                                                                                                                                                       | corner cards, band                                                       |
| 2026-11-17 | popups can be silenced (Show popups switch + "Silence for ▾": 1, 5, 10, 30 min, 1 hour, 1 day, Forever); everything then waits under the bell, add requests included (still 2-minute expiry)                                | the maintainer                                                                                                                                                                                                                                       | add requests always pop up                                               |
| 2026-11-17 | Notifications behind a bell beside the gear                                                                                                                                                                                 | the maintainer                                                                                                                                                                                                                                       | a Settings page, a sidebar section                                       |
| 2026-11-17 | silenced items wait sealed on disk until the sender's expiry                                                                                                                                                                | the maintainer; reuses the inbox pattern, no new crypto                                                                                                                                                                                              | 10 minutes in memory                                                     |
| 2026-11-17 | Stop sharing removes the key entirely, deletes unopened items, tells them with a signed notice; they can add again with a new code                                                                                          | the maintainer                                                                                                                                                                                                                                       | LAN-only revoke, silent revoke, block until allowed                      |
| 2026-11-17 | the Pairing code field takes Cmd/Ctrl+V and has a Paste button; Paste reads the clipboard in main and returns only a pairing-code-shaped value                                                                              | the maintainer; the renderer never sees other clipboard text                                                                                                                                                                                         | typing only                                                              |
| 2026-11-17 | names only in titles; body text says them/they; no explanatory prose                                                                                                                                                        | the maintainer                                                                                                                                                                                                                                       | names repeated in body copy                                              |
| 2026-11-17 | the code screen: "Share this code", live countdown; clicking the code copies it (hover: Click to copy; then ✓ Copied)                                                                                                       | the maintainer; copying it into chat is still out of band                                                                                                                                                                                            | read-aloud only                                                          |
| 2026-11-17 | wrong code: "Code didn't match · Ask them to share their code again and retry"                                                                                                                                              | the maintainer                                                                                                                                                                                                                                       | explanatory prose about who answered                                     |
| 2026-11-17 | expired: adder can Try again (new request, new code); other side "Ask them to request a new pairing code"                                                                                                                   | the maintainer                                                                                                                                                                                                                                       | silent expiry                                                            |
| 2026-11-17 | Cancel on either side, or a dropped connection, ends the request on both sides                                                                                                                                              | the maintainer                                                                                                                                                                                                                                       | waiting out the 2 minutes                                                |
| 2026-11-17 | X / Escape on an item dialog declines nothing: everything waiting moves under the bell                                                                                                                                      | the maintainer                                                                                                                                                                                                                                       | next item pops up                                                        |
| 2026-11-17 | the sender learns only "Sent"                                                                                                                                                                                               | the maintainer; matches files and email                                                                                                                                                                                                              | Opened / Declined notices                                                |
| 2026-11-17 | in the Share dialog, people not on the same network are disabled until you both are; a picked person who drops off is unticked and disabled, live                                                                           | the maintainer. Consequence: while sharing on the network is on, this dialog's Create file and Email reach online people only; with it off, the dialog is today's                                                                                    | offline people tickable                                                  |
| 2026-11-17 | Share on this network off is today's fully offline app; with no network at all, items already waiting stay openable                                                                                                         | the maintainer                                                                                                                                                                                                                                       | —                                                                        |
| 2026-11-17 | the bell list is Notification Center–style cards, actions on the hovered card; surface roles for colour; a text-derived hairline on panel and cards so edges read on dark grounds                                           | the maintainer: rows not to Apple standards, then grey-on-grey, then edges lost on dark                                                                                                                                                              | divided rows with filled buttons; tints of `--bg-elevated`; shadow alone |
| 2026-11-17 | the name others see defaults to the computer's name and can be changed                                                                                                                                                      | the maintainer; the OS already announces it                                                                                                                                                                                                          | user's full name, blank                                                  |
| 2026-11-17 | secret snippets never sent; refused in main too                                                                                                                                                                             | matches Claude and Copy as file                                                                                                                                                                                                                      | sealed secret snippets                                                   |
| 2026-11-17 | accepted item opens in a tab                                                                                                                                                                                                | same as a `.diffbro`                                                                                                                                                                                                                                 | save straight to library                                                 |
| 2026-11-17 | trusted and online peers only                                                                                                                                                                                               | keeps the LAN fence                                                                                                                                                                                                                                  | queueing, connect by IP                                                  |
| 2026-11-17 | Settings ▸ Integrations ▸ Network is a nav page with the app's checkbox toggles                                                                                                                                             | the live render; Settings has no tabs or switches                                                                                                                                                                                                    | tabs, switches                                                           |
| 2026-11-17 | the destructive-button contrast defect is fixed as its own slice before Stop sharing ships                                                                                                                                  | it is the Stop sharing button; pre-existing on light, dark, nord                                                                                                                                                                                     | shipping on a 3.35:1 label                                               |
| 2026-11-17 | the label on the red fill gets its own token, `--text-on-danger` (default `--danger-text`), like `--text-on-accent`; light `--danger-bg` `#cf222e`, dark label `#0d1117`, nord `--danger-bg` `#e0848b` with label `#2e3440` | `--danger-text` is also used as text on the panel (`.claude-error`, `.dg-error`), so changing it would break those. Red: `onDanger/danger` 3.35 light, 3.35 dark, 3.55 nord; green: 5.36, 5.65, 4.66; four baselined pairs now clear and were pruned | darkening red on dark (as-text use drops 5.16 → 3.75)                    |
| 2026-11-17 | `.claude-error` and `.dg-error` paint `--danger-text` (white on light) on the panel: unreadable on light. Pre-existing, outside this feature; not fixed here                                                                | scope                                                                                                                                                                                                                                                | —                                                                        |

## Validation

- [ ] `/validate` — summary below, full report in `quality-audit.md`
- [ ] `npm run check` — paste the real result
- [ ] UI seen running (Docker / `make e2e`), if it has a surface
- [ ] every Docs-impact "yes" done, or which is deferred and why
- [ ] `make local-seed` — n/a, no new format
- [ ] token usage measured, header row filled

### Token usage

| category    | tokens |
| ----------- | -----: |
| input       |        |
| output      |        |
| cache write |        |
| cache read  |        |
| **total**   |        |

**Outcome:**
