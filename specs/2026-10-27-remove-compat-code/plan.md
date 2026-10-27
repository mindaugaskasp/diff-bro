# Remove backward-compatibility code

| | |
|---|---|
| **Status** | in-progress |
| **Progress** | 0 / 3 slices |
| **Branch** | one per slice; see Delivery |
| **Started** | 2026-10-27 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | 2026-10-27T16:07:56Z |
| **Claude tokens used** | — |

## Problem

Issue #113. The maintainer decided (2026-10-24) to stop reading or migrating
data written by older versions, to simplify the code. A sweep of `src/` for
`legacy|migrat|compat` finds 80 mentions in 24 files; the ones that are real
compat paths are below. Each is code every load runs, tests keep alive, and new
work has to route around.

| area | compat code today | what stops working |
|---|---|---|
| Store location | `renderer/src/persist.js:7–27` copies each store forward from its pre-file-store localStorage key | data that only ever lived in localStorage is ignored |
| Settings: shortcut bar | `stores/settingsStore.js:27–31` reads `diffbro.shortcutBarDismissed` from localStorage | the bar shows once more for someone who dismissed it before the setting existed |
| Settings: file-size limit | `utils/settingsDefaults.js:97–108` seeds the text limit from `maxComparisonFileMb`; `settingsStore.js:97–99` still writes that key back ("legacy mirror"); main reads only `fileSizeLimitsMb` (`main/files.js:32`) | an old single limit resets to the default |
| Settings: Quick Look shortcut | `shared/shortcuts.js:7–33` `migratedQuickLookShortcut`, `settingsDefaults.js:206–212`, `settingsStore.js:115`, `main/quickLookCore.js:74–81` | a stored `CommandOrControl+Shift+Space` from before the platform default stays as it is |
| Settings: tag shelf | `utils/tagShelf.js:17–22` `migratedShelfHeight` (rows → px) | an old row-count height resets to the default |
| Onboarding | `features/onboarding/onboardingPersist.js:18–22` `migrated()` | someone mid-way through the old tour layout may be offered it again |
| Saved-diff rows | `utils/diffRowTags.js:9–36` `isLegacy` (entries without `format`) | an old entry shows its format tag as a plain tag |
| Snippet library | `utils/snippetState.js:141–168` `migrate()` folds `categories` into tags, run on every load and written back (`snippetStore.js:52–53`) | a categories-shaped library loads empty |
| Saved diffs | `utils/vaultEntries.js:30–54` accepts a bare array and strips `categoryId` | an old-shaped vault loads empty |
| Snippet bundles | `main/snippetSealing.js:28–29,39–43,110–140` validates the categories bundle; `stores/snippetStore.js:373–375,402–415` restores it | an old shared snippet bundle fails to import |
| Key files | `main/sealing.js:171–182` imports a plain-JSON public key | an old plain `.diffbrokey` fails to import |
| Key format | `main/sealing.js:35` `ACCEPTED_KEY_FORMATS` still takes `diffbro-key/1` (64-bit fingerprint era) on import | a pre-128-bit key export fails to import; keys already trusted are unaffected (the store is not re-checked) |
| KDF | `main/kdf.js:14,35` `LEGACY_PARAMS` (scrypt N=2¹⁴) for an envelope with no `kdf` | text encrypted, a snippet bundle or a config backup made before the `kdf` field existed can no longer be opened |

**Not compat; stays** (verified):

- `main/vault.js:56`: a plaintext vault key is refused while the keychain
  works. That is a live safety path (a planted key), and it is also how a
  keychain-less Linux runs.
- `persist.js`'s localStorage **fallback** when there is no store IPC: the unit
  tests run on it. Only the one-time migration goes.
- Retired identity keys decrypt only, and the session / `.diffbro` format tags
  bound into the AAD: these are security invariants (hard rule 5), not
  migrations.
- `tests/data/config-v1.json` and `config-v2.json`: the demo comparison
  (`main/demoContent.js`), not a compat fixture.
- Key-name limit: already one limit of 40 since #124; nothing left to remove.

## Solution

Delete each path and the tests that exist only to keep it alive. Data in an
old shape takes the current-shape path: it validates as nothing and is
overwritten by the next save. Old-format imports fail with the error they
already get for a malformed file. Ship as 0.14.0 with a **Breaking changes**
section in the release notes.

| option | why not |
|---|---|
| Move an unreadable store aside (`snippets.unreadable-<date>.json`) and show a notice | the user chose ignore-and-overwrite: simplest, and only someone skipping many versions can hit it |
| Refuse to start a store that is in an old shape | blocks the app for a case that needs no rescue |
| Re-encrypt old-KDF data on next unlock, delete the branch a release later | keeps the compat code for another release; the maintainer accepted the data loss |
| A new "this file is too old" message for imports | a new string and branch for a dead format; the malformed-file error is accurate |
| 1.0.0 | under 1.0 semver lets a minor carry breaking changes, and 1.0 signals more than a cleanup |

## Scope

**In:** every row of the Problem table; the tests and fixtures that only serve
them; `docs/security.md` and `docs/standards.md` text describing removed
paths; the version bump to 0.14.0.

**Out:**
- the eight hard security rules and the AAD version tags;
- new user-facing copy (old imports reuse the existing errors);
- the release itself (tag and notes are cut when the stack is on `main`).

## Design

No visible surface. The only user-facing change is that old data and old files
stop loading, through paths and messages that already exist. No canvas.

## Security rules touched

- **Rule 5, crypto invariants.** `kdf.js`, `sealing.js` and `snippetSealing.js`
  change. Each change only narrows what is accepted: an envelope with no `kdf`
  becomes malformed (rejected before any derivation), a plain-JSON key file is
  refused, the categories bundle is refused. Nothing about sealing, the
  audience binding, retired keys or the TTL changes. `tests/` changes in the
  same slice, with negative tests for each refusal, and the share roundtrip is
  re-verified in Docker.
- **Rule 6, untrusted input.** The size caps and shape validation stay; the
  legacy validator and its caps (`categories: 200`, `snippetsPerCategory`) go
  with the shape they guarded.
- No IPC, network, dependency or sandbox exit changes.

## Test plan

- **unit, red first**, one per refusal or reset, each watched failing against
  today's code:
  - `tests/main/kdf.test.js`: `scryptParamsFor({})` is `null`, not the legacy
    params.
  - `tests/main/sealing.test.js`: a plain-JSON public key file is rejected.
  - `tests/main/snippetSealing.test.js`: a `categories` bundle is `malformed`.
  - `tests/renderer/utils/snippetState.test.js`: a categories-shaped library
    reads as empty.
  - `tests/renderer/utils/vaultEntries.test.js`: a bare-array vault reads as
    empty.
  - settings / onboarding / tag shelf / Quick Look shortcut: an old-only field
    yields the default.
- **delete** the tests asserting each migration.
- **e2e**: `make e2e` whole; no spec exercises old data, so none should change.
  Any that does is a finding.
- **Docker share roundtrip** after slice 3 (rule 5): seal, open, rotate, open
  with the retired key.
- **seed fixtures**: no change (no format added or reshaped).

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | no | no feature-status change |
| `docs/screenshots/*.png` | no | nothing visible changes |
| `docs/roadmap.md` | no | not a roadmap track |
| `docs/brand/roadmap.svg` | no | same |
| `docs/security.md` | yes | the KDF section stops describing the N=2¹⁴ fallback; key import stops mentioning plain JSON |
| `docs/standards.md` | yes | only if a removed path is described; checked in slice 3 |
| `package.json` | yes | `version` 0.14.0, in slice 3 |

## Delivery

| # | slice | branch | base | PR | status |
|---|---|---|---|---|---|
| 1 | Settings and UI state: localStorage migration, shortcut bar, file-size limit and its mirror, Quick Look shortcut, tag shelf, onboarding, `isLegacy`. Carries this spec. | `improvement/drop-compat-state` | `main` | | |
| 2 | Library shapes: snippet `migrate()` categories path and its write-back, vault bare array and `categoryId`, the categories snippet bundle (main and renderer) | `improvement/drop-compat-library` | slice 1 | | |
| 3 | Crypto-adjacent: KDF legacy params, plain-JSON key import, `diffbro-key/1`; docs; 0.14.0 | `improvement/drop-compat-crypto` | slice 2 | | |

## Implementation plan

- [ ] 1. Slice 1: red tests for the resets; delete the paths; `npm run check`; `make e2e`; `/validate`; PR.
- [ ] 2. Slice 2: red tests (categories library and vault read empty, categories bundle `malformed`); delete; check; e2e; validate; PR.
- [ ] 3. Slice 3: red tests (`scryptParamsFor({})` null, plain key refused); delete; `docs/security.md`; 0.14.0; check; e2e; Docker share roundtrip; validate; PR.
- [ ] 4. Merge bottom-up as each is green; release notes draft with **Breaking changes**.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-24 | Drop compat code across the codebase | the maintainer: simplify; older data is no longer read or migrated | keeping migrations |
| 2026-10-27 | `LEGACY_PARAMS` deleted outright; data under the old KDF becomes unreadable | the maintainer accepted the data loss | re-encrypt on unlock; a one-off export |
| 2026-10-27 | A store file in an old shape is ignored and overwritten on the next save | the user's choice; only someone skipping many versions hits it | move aside with a notice; refuse to start the store |
| 2026-10-27 | Old-format imports fail with the existing malformed-file error | accurate, and no new copy for a dead format | a dedicated "too old" message |
| 2026-10-27 | Ship as 0.14.0 with Breaking changes in the notes | pre-1.0 semver allows it in a minor | 1.0.0 |
| 2026-10-27 | `assignOrder` stays | received diffs, imports and seeded examples can arrive with no `order`; it numbers them, so it is not only compat | deleting it |
| 2026-10-27 | `LEGACY_QUICKLOOK_SHORTCUT` renamed, not removed | it is still the macOS and Linux default | deleting the value |
| 2026-10-27 | `diffbro-key/1` import dropped too | found while building slice 3: the same kind of compat, on the same import path | keeping it |
| 2026-10-27 | Three slices by area | each reviewable alone; crypto isolated for its rule-5 verification | one PR |

## Validation

- [ ] `/validate`
- [ ] `npm run check`
- [ ] `make e2e`
- [ ] Docker share roundtrip (slice 3)
- [ ] every Docs-impact "yes" done
- [ ] token usage measured
