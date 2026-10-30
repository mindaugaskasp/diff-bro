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
// on a start link mid-tour opens a picker over the card that is pointing at it,
// and every step but one is showing a control rather than asking for it.
const STEPS = [
  {
    id: 'compare',
    since: '0.5.0',
    target: '[data-tour="start"]',
    side: 'bottom',
    advance: 'tour-demo-diff',
    reveal: true
  },
  {
    id: 'share',
    since: '0.5.0',
    target: '[data-tour="share"]',
    // The button is what you press; the comparison is what gets sealed.
    context: '[data-tour="pane"]',
    side: 'bottom'
  },
  {
    id: 'library',
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
    since: '0.5.0',
    // No anchor for the launcher itself: it is a separate window that opens ON
    // TOP of this one. The step names the key and leaves the press to the user
    // — summoning it here stole focus and put its own explanation behind it.
    target: '[data-tour="search"]',
    side: 'right'
  },
  {
    id: 'snippet-new',
    since: '0.5.0',
    target: '[data-tour="snippet-new"]',
    context: '[data-tour="sidebar"]',
    enter: 'tour-show-snippets',
    side: 'right',
    advance: 'tour-demo-snippet',
    undo: 'tour-close-snippet'
  },
  {
    id: 'snippet-save',
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
    id: 'diagram-open',
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
    since: '0.5.0',
    target: '[data-tour="pane"]',
    side: 'left',
    zone: true
  }
]

/** What the consent dialog says the tour covers. */
export const TOUR_TOPICS = [
  { icon: 'diff', hue: 'diff', labelKey: 'onboarding.tourConsent.topicCompare' },
  { icon: 'share', hue: 'secure', labelKey: 'onboarding.tourConsent.topicShare' },
  { icon: 'search', hue: 'inspect', labelKey: 'onboarding.tourConsent.topicFind' },
  { icon: 'code', hue: 'snippet', labelKey: 'onboarding.tourConsent.topicSnippets' }
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

const NONE = { mode: 'none', steps: [] }
const MAX_DEFER = 2

// Steps introduced after the version last seen. Null when the user has not yet
// been through what existed then, so a resumed tour is never taken for an update.
function upgradeSteps(steps, at, seenVersion) {
  if (!seenVersion) return null
  const older = steps.filter((s) => compareVersions(s.since, seenVersion) <= 0)
  if (at < older.length) return null
  return steps.filter((s) => compareVersions(s.since, seenVersion) > 0)
}

const prompt = (kind, steps, deferred) =>
  (deferred ?? 0) >= MAX_DEFER ? NONE : { mode: 'prompt', kind, steps }

/**
 * What the tour should do right now. Nothing starts unannounced: a first run
 * and an update's new steps both ask first; only a tour already agreed to resumes.
 * @param {import('../types').TourState} state
 * @returns {{ mode: 'steps'|'prompt'|'none', kind?: 'intro'|'update', steps: import('../types').TourStep[] }}
 */
export function tourPlan(state) {
  const steps = state.allSteps ?? TOUR_STEPS
  if (!state.showTips) return NONE
  const at = state.tourStep ?? 0

  const fresh = upgradeSteps(steps, at, state.seenVersion)
  if (fresh) return fresh.length ? prompt('update', fresh, state.tourDeferred) : NONE
  if (at >= steps.length) return NONE
  if (at > 0) return { mode: 'steps', steps: steps.slice(at) }
  return prompt('intro', steps, state.tourDeferred)
}
