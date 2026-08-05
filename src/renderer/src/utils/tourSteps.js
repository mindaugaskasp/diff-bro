// The onboarding tour's schedule: which step plays when, and what each one
// points at. Its WORDS live in tourCopy.js — edit wording there. No Vue, no
// stores; the store owns transitions, this owns the schedule.
//
// Targets are `data-tour` attributes rather than styling classes: a class moves
// when a component is restyled and the tour would then point at nothing.
//
// A step's `advance` runs on NEXT, never on entry: the step points, the press
// acts, and the step after lands inside what opened. Its bookends are `enter`
// (arrival), `leave` (left in EITHER direction) and `undo` (Back, reversing an
// advance).

import { TOUR_COPY } from './tourCopy'

/** Version whose steps the current list represents. Bump with a NEW step. */
export const TOUR_VERSION = '0.5.0'

// Behaviour only. The hole a step cuts is BLOCKED unless it says `live`: a click
// on a file slot mid-tour opens a picker over the card that is pointing at it,
// and every step but one is showing a control rather than asking for it.
const STEPS = [
  {
    id: 'compare',
    run: 1,
    since: '0.5.0',
    target: '[data-tour="slots"]',
    side: 'bottom',
    advance: 'tour-demo-diff',
    reveal: true
  },
  {
    id: 'share',
    run: 1,
    since: '0.5.0',
    target: '[data-tour="share"]',
    // The button is what you press; the comparison is what gets sealed.
    context: '[data-tour="pane"]',
    side: 'bottom'
  },
  {
    id: 'library',
    run: 1,
    since: '0.5.0',
    // The sidebar is the surface all three of these steps work inside: cut out
    // of the veil and stroked, with the ring on the one control that matters.
    target: '[data-tour="sidebar"]',
    context: '[data-tour="sidebar"]',
    point: '[data-tour="search"]',
    side: 'right',
    enter: 'tour-demo-search',
    leave: 'tour-clear-search'
  },
  {
    id: 'quick-look',
    run: 1,
    since: '0.5.0',
    // The chord is a GLOBAL shortcut that main ignores while this window is in
    // front; the step asks for the press anyway, so it lifts that while it is up.
    enter: 'tour-arm-chord',
    leave: 'tour-disarm-chord',
    // No anchor for the launcher itself: it is a separate window that opens ON
    // TOP of this one. The step names the key and leaves the press to the user
    // — summoning it here stole focus and put its own explanation behind it.
    target: '[data-tour="search"]',
    side: 'right'
  },
  {
    id: 'settings-open',
    run: 1,
    since: '0.5.0',
    // Absent on macOS, where the menu bar is the OS's — the missing-target
    // fallback centres the card, and the copy names the File menu on both.
    target: '[data-tour="menubar"]',
    side: 'bottom',
    advance: 'settings',
    undo: 'tour-close-settings'
  },
  {
    id: 'settings-panes',
    run: 1,
    since: '0.5.0',
    target: '[data-tour="settings-nav"]',
    context: '[data-tour="settings"]',
    side: 'right',
    // Idempotent going forwards, where Settings is already open; what reopens
    // it when Back returns here from a step that closed it.
    enter: 'settings'
  },
  {
    id: 'settings-tips',
    run: 1,
    since: '0.5.0',
    target: '[data-tour="tips"]',
    context: '[data-tour="settings"]',
    side: 'top',
    enter: 'settings',
    // The last step inside Settings: leaving it either way puts the dialog
    // away, so the steps that follow are not read through it.
    leave: 'tour-close-settings'
  },
  {
    id: 'snippet-new',
    run: 2,
    since: '0.5.0',
    target: '[data-tour="snippet-new"]',
    context: '[data-tour="sidebar"]',
    side: 'right',
    advance: 'tour-demo-snippet',
    undo: 'tour-close-snippet'
  },
  {
    id: 'snippet-save',
    run: 2,
    since: '0.5.0',
    // The one step that asks for the press it rings. Its Next does NOT save —
    // a card button doing exactly what the ringed control does reads as two
    // ways to do one thing, and teaches neither.
    live: true,
    target: '[data-tour="snippet-save"]',
    context: '[data-tour="snippet-editor"]',
    side: 'top',
    leave: 'tour-close-snippet'
  },
  {
    id: 'snippet-drag',
    run: 2,
    since: '0.5.0',
    target: '[data-tour="pane"]',
    side: 'left',
    zone: true
  },
  {
    id: 'diagram-open',
    run: 2,
    since: '0.5.0',
    target: '[data-tour="snippets"]',
    context: '[data-tour="sidebar"]',
    point: '[data-tour="snippet-diagram"]',
    side: 'right',
    // A tag filter or a leftover search hides the row this step is about.
    enter: 'tour-clear-filters',
    advance: 'tour-demo-diagram',
    reveal: true
  },
  {
    id: 'diagram',
    run: 2,
    since: '0.5.0',
    target: '[data-tour="pane"]',
    side: 'left',
    zone: true
  }
]

/** @type {import('../types').TourStep[]} */
export const TOUR_STEPS = STEPS.map((step) => ({ ...step, ...TOUR_COPY[step.id] }))

const parts = (v) =>
  String(v || '0')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)

/** Numeric semver-ish compare, so 0.10.0 sorts above 0.9.0 rather than below. */
export function compareVersions(a, b) {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/**
 * The contiguous block of steps sharing the run of the step at `index`.
 * Stops at the run boundary so run one never spills into run two.
 */
export function runBlockAt(index, steps = TOUR_STEPS) {
  const first = steps[index]
  if (!first) return []
  const block = []
  for (let i = index; i < steps.length && steps[i].run === first.run; i++) block.push(steps[i])
  return block
}

const NONE = { mode: 'none', steps: [] }

// Steps introduced after the version last seen. Returns null when the pointer
// has not yet reached the end of what existed back then, so a resumed tour is
// never mistaken for an upgrade.
function upgradePlan(steps, at, seenVersion) {
  if (!seenVersion) return at >= steps.length ? NONE : null
  const older = steps.filter((s) => compareVersions(s.since, seenVersion) <= 0)
  if (at < older.length) return null
  const fresh = steps.filter((s) => compareVersions(s.since, seenVersion) > 0)
  return fresh.length ? { mode: 'steps', steps: fresh } : NONE
}

/**
 * What the tour should do right now.
 *
 * `prompt` is the "Three more tips?" dialog: run two is never started
 * unannounced, because the gap between finishing run one and being ready for
 * more is the user's to judge, not ours.
 *
 * @param {import('../types').TourState} state
 * @returns {{ mode: 'steps'|'prompt'|'none', steps: import('../types').TourStep[] }}
 */
export function tourPlan(state) {
  const steps = state.allSteps ?? TOUR_STEPS
  if (!state.showTips) return NONE

  const at = state.tourStep ?? 0
  // An update's new steps outrank the run-two prompt: only new ones are left,
  // and they play as their own run rather than re-opening a finished tour.
  const upgrade = upgradePlan(steps, at, state.seenVersion)
  if (upgrade) return upgrade

  const block = runBlockAt(at, steps)
  if (!block.length) return NONE
  // Ask only when ARRIVING at a later run, never when resuming one already
  // under way — `at` must be that run's first index in the whole list.
  const entering = block[0].run > 1 && at === steps.findIndex((s) => s.run === block[0].run)
  if (!entering) return { mode: 'steps', steps: block }
  return (state.tourDeferred ?? 0) >= 2 ? NONE : { mode: 'prompt', steps: block }
}
