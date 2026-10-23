# Ask before the tour, and cut it to what still teaches

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 9 / 9 steps |
| **Branch** | `improvement/tour-consent` |
| **Started** | 2026-10-23 |
| **Finished** | 2026-10-23 |
| **Bugs found and fixed this iteration** | 7 / 7 |
| **Token baseline** | 2026-10-23T11:31:51Z |
| **Claude tokens used** | 12,975,892 |

## Problem

I walked all 12 steps on a cold profile, on a macOS host build, screenshotting
each step.

1. **There is no consent.** A first launch drops the veil and step 1 straight
   onto the window (`onboardingStore.begin` → `_open`). The only way out is
   Skip tips, and pressing it also turns tips off for every later version.
2. **The copy is stale after the rail redesign.**
   - `share` sends the user to "Security ▸ Share My Public Key / Add Trusted
     Key". Keys now live in the rail.
   - `library` says "Saved diffs, shared diffs and snippets all live here". The
     search is scoped per panel now, and the step silently switches to
     Snippets.
   - `settings-open` says "Fourteen themes". There are 20.
3. **The run-two prompt contradicts itself.** It asks "Three more tips?" and
   then plays five steps (`tourSteps.js`, `run: 2`). It is also a second
   consent dialog in the middle of the tour.
4. **Three steps are spent on Settings.**
   - On macOS, `settings-open` has no anchor, because the menu bar belongs to
     the OS. The card floats centred, pointing at nothing.
   - `settings-tips` places its card over the checkbox labels it describes.
5. **Two steps repeat the Start surface.** `compare` and `snippet-drag`
   repeat what "What are you comparing? Drop files anywhere in this window…"
   already says on screen. `snippet-drag` points at the whole pane with a
   sentence and nothing to do.

## Solution

**One consent dialog in front of every tour start the user did not ask for,
then one run of eight steps.**

- **The dialog** replaces `ContinueTourDialog`.
  - It names what the tour covers, so the user can judge relevance before
    anything moves.
  - **Start the tour** plays it.
  - **No thanks** turns tips off. Settings ▸ Show tour still replays it.
  - × or Escape means "not now": it asks once more on a later launch, reusing
    `deferred` / `MAX_DEFER`. After two asks it stops.
- **The update path asks first too.** When an update adds steps
  (`upgradePlan`), the same dialog asks "{n} new tips since your last update".
- **Replay is unchanged.** Settings ▸ Show tour is already a deliberate
  request, so it plays without asking.

| step | verdict | why |
|---|---|---|
| compare — load demo pair | **keep** | the demo pair is what every later step stands on |
| share | **keep, rewrite** | point at Keys in the rail, not the Security menu; half the length |
| library (search) | **keep, rewrite** | per-panel search; say it filters the panel you're in |
| quick-look | **keep** | the one feature you can't discover by looking |
| settings-open | **remove** | no anchor on macOS; "Fourteen themes" |
| settings-panes | **remove** | reads out a nav list the user can see |
| settings-tips | **remove** | the dialog now tells you where Show tour is; its card covered the labels |
| snippet-new | **keep** | |
| snippet-save | **keep** | the one live step |
| snippet-drag | **remove** | the Start surface says it; nothing to do |
| diagram-open | **keep** | |
| diagram | **keep** | the strongest demo in the tour |

That leaves 8 steps, down from 12, in one run instead of two. Run-two
machinery goes: the `run` field, `runBlockAt` and the mid-tour prompt.

| option | why not |
|---|---|
| Keep two runs, add a dialog before run one | two consent dialogs in one tour; run two's prompt is already miscounted |
| Topic picker (choose which sections to see) | 8 steps is about a minute; a picker costs more than it saves |
| Remove the tour, rely on the Start surface | the Start surface cannot teach quick look, sealed sharing or diagram diffs |
| A ghost "Not now" on the first step's card | the veil is already down by then, which is the problem |

## Scope

**In:**
- the consent dialog, covering both first run and update;
- the step cuts and rewrites;
- removing runs and the mid-tour prompt;
- migrating persisted state;
- tests.

**Out:**
- the callout and overlay visuals, which are unchanged;
- the content of the Start surface;
- the Settings "Show tips after an update" row, which is unchanged.

## Design

```
┌ Take a one-minute tour? ───────────────────── × ┐
│ Eight short steps over the real app.            │
│                                                 │
│  [diff]   Compare two files, any format         │
│  [share]  Share a comparison sealed             │
│  [search] Find anything again, from any app     │
│  [code]   Keep snippets and diagrams            │
│                                                 │
│ You can start it later with Show tour, in Settings.       │
│                      [ No thanks ] [Start tour] │
└─────────────────────────────────────────────────┘
```

- **Container:** `BaseDialog`, `width="420px"`.
- **Topic rows:** `.glyph-well` icons from `icons.js` (`diff`, `share`,
  `search`, `code`) with `--text`, so no new colour role is introduced.
- **Footnote:** `.dialog-note`, set in `--text-meta`.
- **Buttons:** **No thanks** is `.btn-ghost`, the dismissive twin beside a
  primary. **Start tour** is `.btn-primary`.
- **Update variant:** the same dialog. Its title is
  "{n} new tips since your last update", and it lists only the new steps'
  titles.

### Theme verdict — all 20

Every part is an existing role already held on all 20 themes by
`check:themes`:
- the `BaseDialog` panel;
- `.btn` / `.btn-primary` / `.btn-ghost`;
- `.glyph-well` (glyph on well ≥ 4.5);
- `--text-meta`.

The hard keylines on `contrast` and `beacon` come through the dialog's own
border, and no accent glow is added for `matrix`, `nyan` or `neon` to halo.
The dialog joins the theme sweep's `SURFACES` and is measured on all 20
before the PR.

## Security rules touched

None. No IPC, no fs, no crypto, no new dependency, no external link. The
persisted state stays in `onboarding.json` via `savePersisted`.

## Test plan

- **unit** `tests/renderer/utils/tourSteps.test.js`:
  - `tourPlan` returns `prompt` on a cold profile, not `steps` (red first);
  - an update with new steps returns `prompt` carrying those steps;
  - `showTips: false` returns `none`;
  - two defers return `none`;
  - the step list has no `run` and is 8 long.
- **unit** `onboardingStore.test.js`:
  - **No thanks** sets `showTips` false;
  - a dismiss defers;
  - accepting opens step 1;
  - replay bypasses the dialog;
  - migration: a profile mid-tour or past old run one is marked seen and is
    never re-prompted.
- **e2e** `e2e/onboarding-tour.spec.mjs`:
  - a cold launch shows the dialog with no veil and no callout (red first);
  - Start opens step 1 on the slots;
  - No thanks leaves no veil, and a relaunch does not ask again;
  - Escape asks once more on the next launch.
- **e2e:** the existing tour specs, re-pointed at the 8-step run.
- **copy check:** the walk screenshots retaken; no step names a menu path that
  no longer exists.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | no | the tour isn't described there |
| `docs/screenshots/*.png` | no | the five captured states have tips off |
| `docs/roadmap.md` | no | a refinement, not a track |
| `docs/brand/roadmap.svg` | no | same |
| `docs/features.md` | yes | if it describes the tour, update the step list and the consent step |

## Implementation plan

- [x] 1. Failing `tourPlan` tests: cold profile → prompt; update → prompt
- [x] 2. Collapse the step list to 8, drop `run` / `runBlockAt`, prompt-first `tourPlan`
- [x] 3. Store: `accept` / `decline` / `defer`, migrate old `tourStep`, replay unchanged
- [x] 4. `TourConsentDialog.vue` replaces `ContinueTourDialog`, including the update variant
- [x] 5. Copy: rewrite share and library; delete the removed steps' keys; pseudolocale
- [x] 6. e2e: consent paths red → green; re-point the existing tour specs
- [x] 7. Theme sweep surface `tour-consent`, all 20
- [x] 8. Retake the tour walk; `docs/features.md`
- [x] 9. `/validate`, `npm run check`, full `make e2e`

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-23 | × / Escape = defer, "No thanks" = off | closing a dialog is not a decision; the explicit button is | treating every dismiss as off |
| 2026-10-23 | Persistence moved to `onboardingPersist.js` | the store reached 260 lines against the 250 cap; read/clamp/migrate/write is one concern | trimming comments to fit |
| 2026-10-23 | `.btn-ghost` label `--text-dim` → `--text-meta` | the sweep measured No thanks at 3.44–4.31 on solar, nord, sepia, bloom; `--text-dim` is documented to miss 4.5 there, and this fixes every Cancel/Close too | a dialog-local override |
| 2026-10-23 | Footnote names "Show tour, in Settings" without `▸` | the Linux font tofus `▸` in the dialog | keeping the glyph |
| 2026-10-23 | `tour-close-settings` command and the dialog-containment e2e removed | no step opens Settings any more; replay closes it itself | keeping dead registry rows |
| 2026-10-23 | Migrate any started profile to "seen" | old indices point into a 12-step list | remapping by step id, which no longer has a home for most of them |

## Validation

- [x] `/validate`: comments swept, and stale "run" wording removed from the
  store, the typedefs and the glossary. No security rule is touched.
- [x] `npm run check` exits 0: 3878 tests pass, and coverage is
  95.38 / 88.49 / 95.97 / 96.41.
- [x] UI seen running:
  - `e2e/tour-consent.spec.mjs` was 4 red against the old build, then green.
  - `onboarding-tour.spec.mjs` passes on the 8-step run.
  - Full `make e2e`: 553 passed, 4 skipped.
  - Theme sweep `tour-consent`: 100 measurements across 20 themes, all at or
    above their floors once the ghost-label fix was in.
  - I walked the tour again on the host and screenshotted every step.
- [x] Docs-impact "yes" done:
  - `docs/features.md`;
  - `docs/glossary.md` (Run → Consent dialog);
  - `docs/roadmap.md` (the onboarding state diagram).
- [x] Token usage measured.

| category | tokens |
|---|---:|
| input | 88 |
| output | 37,526 |
| cache write | 76,862 |
| cache read | 12,861,416 |
| **total** | **12,975,892** |

**Outcome:** shipped.
- A first launch, or an update that adds steps, now asks before any veil comes
  down: Start tour, No thanks (off), or Escape (asked once more).
- The tour is one run of 8 steps instead of 12 in two runs, and its copy now
  matches the rail layout.
