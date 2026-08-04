// The onboarding tour's step list and the pure rules that decide what plays
// now. No Vue, no stores — the store owns transitions, this owns the schedule.
//
// Targets are `data-tour` attributes rather than styling classes: a class moves
// when a component is restyled and the tour would then point at nothing.

/** Version whose steps the current list represents. Bump with a NEW step. */
export const TOUR_VERSION = '0.5.0'

/** @type {import('../types').TourStep[]} */
export const TOUR_STEPS = [
  {
    id: 'compare',
    run: 1,
    since: '0.5.0',
    target: '[data-tour="slots"]',
    side: 'bottom',
    command: 'tour-demo-diff',
    reveal: true,
    title: 'Two files, any way you like',
    body: 'Drop them anywhere on this window, or click a slot to browse. Diff Bro picks the viewer for you — text, JSON tree, spreadsheet grid or diagram.'
  },
  {
    id: 'share',
    run: 1,
    since: '0.5.0',
    target: '[data-tour="share"]',
    side: 'bottom',
    title: 'Send it sealed, not screenshotted',
    body: 'Share seals this comparison for the people you pick. You each import the other’s public key once; after that it takes two clicks, and it stops opening on a clock you set.'
  },
  {
    id: 'quick-look',
    run: 1,
    since: '0.5.0',
    target: '[data-tour="search"]',
    side: 'right',
    title: 'Find anything without coming back here',
    body: 'This box searches your library. The same search opens over every other app on {shortcut} — snippets and tools alike — and works while Diff Bro is minimised.'
  },
  {
    id: 'settings',
    run: 1,
    since: '0.5.0',
    target: '[data-tour="tips"]',
    side: 'top',
    command: 'settings',
    title: 'Make it yours — and switch this off',
    body: 'Fourteen themes, size limits, where your data is kept, and the shortcut above. Tips have an off switch right here, and a Show tour button whenever you want them back.'
  },
  {
    id: 'snippet',
    run: 2,
    since: '0.5.0',
    target: '[data-tour="snippet-save"]',
    side: 'top',
    command: 'tour-demo-snippet',
    title: 'Park this where you can find it',
    body: 'Anything you retype belongs here — a deploy payload, a prompt, a config block. Name it, tag it, and the search finds it next week.'
  },
  {
    id: 'snippet-drag',
    run: 2,
    since: '0.5.0',
    target: '[data-tour="pane"]',
    side: 'left',
    zone: true,
    from: '[data-tour="snippets"]',
    title: 'Drag it anywhere in here',
    body: 'The whole comparison area takes a drop — you don’t have to land on a file box. A snippet can face a file, or another snippet.'
  },
  {
    id: 'diagram',
    run: 2,
    since: '0.5.0',
    target: '[data-tour="snippets"]',
    side: 'right',
    title: 'A diagram change, as a diagram',
    body: 'A Mermaid snippet previews live as you type it — there is one in here already. Compare two versions and every added, removed or changed node is marked on the picture rather than the text.'
  }
]

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
