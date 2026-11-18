# Add nearby people from the Share dialog; one mutual add

|                    |                                                     |
| ------------------ | --------------------------------------------------- |
| **Status**         | in-progress (Approved design signed off 2026-11-18) |
| **Issue**          | #262                                                |
| **Branch**         | `feat/lan-add-from-share`                           |
| **Started**        | 2026-11-18                                          |
| **Token baseline** | 2026-11-17T22:49:48Z                                |

## Problem

The Share dialog lists only people you have already added. Adding someone means
leaving the share for Settings ▸ Network, and adding is one-way: the other side
has to Add back with a second code exchange before either can send.

## Design

Canvas: https://claude.ai/artifact/XvWgSvNfZ1WEnssqab125D — its **Approved
design** page is the reference. Every board is the live app, drawn by
`design/render/262-lan-add-share.render.mjs`, in light and dark.

| board                                        | shows                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Share — A                                    | Nearby people listed under your people in the Share list, each with Add; an older version greyed with "Needs update" |
| Share — nobody added yet                     | the picker with only Nearby, instead of the one-time setup screen                                                    |
| 1 · You type their code                      | today's Add dialog, opened over Share                                                                                |
| 2 · Waiting for their confirm                | "Waiting for {name}", the confirm code their screen should show, Cancel                                              |
| 3 · Back in Share, ticked                    | the new person in your people, ticked; "Added {name}"                                                                |
| Their 1 · code / 2 · confirm / 3 · added     | today's code screen; "Add {name}?" with the same confirm code, Decline / Add; then only the notice                   |
| Wrong code / They declined / Ran out of time | nothing stored on either side                                                                                        |
| Settings ▸ Network                           | the same flow; "Needs update"                                                                                        |

## Protocol

1. Unchanged up to the code: add-request (commit), add-reply, add-reveal, the
   holder shows the pairing code, the adder types it.
2. Correct code: the adder sends `add-result: matched` and **stores nothing**.
   Both sides derive a 4-character confirm code from the pairing code
   (`confirmCode`). The adder shows it ("Waiting for {name}"); the holder shows
   it with Decline / Add.
3. Holder **Add**: stores the adder's key, sends `add-result: accepted`. The
   adder stores the holder's key on `accepted`. Both: "Added {name}".
4. Holder **Decline**: sends `declined`; nothing is stored anywhere. Expiry or
   cancel at any point: the same.

Why the confirm step is sound: a key swapped in the middle gives the two sides
different pairing codes, so the adder's typed code fails and no confirm code is
shown on the adder's screen; the holder's confirm code then has nothing to match.

Announcements carry `v=2`; a `v=1` peer is listed with Add disabled and "Needs
update". There is no mixed flow.

## Decisions

| date       | decision                                                                                               | why                                                                                                         | rejected                                |
| ---------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 2026-11-18 | nearby people are added from inside the Share dialog                                                   | adding meant leaving the share                                                                              | Settings only                           |
| 2026-11-18 | adder types the code, holder confirms against a short code both screens show; both keys stored at once | one exchange, no Add back, MITM-safe                                                                        | Add back; a bare "Add Ana too?"         |
| 2026-11-18 | one flow everywhere, Settings too                                                                      | two behaviours to learn                                                                                     | Share only                              |
| 2026-11-18 | after adding from Share, the person is ticked and the dialog stays                                     | nothing sent without the user seeing it                                                                     | send at once; leave unticked            |
| 2026-11-18 | declined or expired after a correct code stores nothing on either side                                 | no half-added state                                                                                         | keep the holder's key                   |
| 2026-11-18 | older peers shown with Add disabled, "Needs update"                                                    | no mixed flow                                                                                               | fall back; hide them                    |
| 2026-11-18 | Share list layout A (Nearby under your people)                                                         | who is around, without a click                                                                              | B, behind one button                    |
| 2026-11-18 | the search field filters Nearby too                                                                    | typing a name finds them wherever they are listed                                                           | Nearby always unfiltered                |
| 2026-11-18 | only the adder's Share dialog ticks the new person; the holder's only refreshes                        | a tick nobody made could seal for someone unintended                                                        | tick on both sides                      |
| 2026-11-18 | the protocol version lives in `src/shared/lanProtocol.js`                                              | main announces it, the renderer compares against it                                                         | a copy on each side                     |
| 2026-11-18 | the one-time setup shows only when nobody is nearby; `share.spec` turns sharing off to reach it        | the approved nobody-added board replaces it while someone is around, and parallel workers share the network | keep setup whenever no keys are trusted |

## Steps

- [x] 1. `confirmCode` in pairingCode.js, unit-tested.
- [x] 2. pairing.js: confirm stage on both sides, `confirm(id, accept)`, accepted/declined results; storing only on accept. Unit tests first.
- [x] 3. Frames: `add-result` gains accepted/declined. Discovery: announce `v=2`, accept `v=1` as needing an update; peers carry `version`.
- [x] 4. IPC + preload: `lan:confirm`.
- [x] 5. Renderer: ConfirmCodeDialog (waiting / confirm), declined result, "Added {name}" for both roles; Add back removed.
- [x] 6. Share dialog: Nearby group (A), Add from inside it, tick the new person; nobody-added state.
- [x] 7. Settings ▸ Network: "Needs update".
- [x] 8. e2e: mutual add in one exchange, decline stores nothing, add from Share ticks the person; helpers updated.
- [x] 9. Docs: features, security (the confirm step), glossary.
- [x] 10. `npm run check`, full `make e2e`, PR.

## Validation

- `npm run check`: exit 0. 365 files, 4998 tests passed (2 skipped); coverage 95.68 / 89.08 / 96.47 / 96.78; lint, styles, themes, structure, i18n (1624 keys, all used), rawtext clean.
- `make e2e`: 802 passed, 4 skipped, 1 failed (`share.spec` saw other workers' apps as Nearby). Fixed by turning sharing off in that spec; `share`, `lan-pairing` and `lan-send` then 12/12 with two workers.
- Red check: with the refresh-and-tick watcher disabled, "someone nearby is added from the Share dialog, ticked, and the dialog stays" fails at `toBeChecked`; restored, it passes.
- Theme sweep (`SWEEP_ONLY=lan-confirm,share-nearby,settings-network`): 160 measurements across 20 themes, all above floor. Two surfaces added: `lan-confirm`, `share-nearby`.
