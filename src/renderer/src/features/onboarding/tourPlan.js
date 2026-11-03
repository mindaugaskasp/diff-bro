// Who is offered the core tour, and what each tour's seen state is. Pure: the
// store hands in what is stored and what the library holds.
import { EXAMPLE_TAG } from '../../utils/snippetExamples'

export const SCHEMA = 2
const ENDED = ['done', 'skipped']
const DIFF_PANELS = ['home', 'diffs']

const isOwnSnippet = (entry) => !(entry.tags ?? []).includes(EXAMPLE_TAG)

/**
 * A fresh install has no onboarding file at all and nothing in its library
 * beyond the seeded examples.
 * @param {object|null} stored
 * @param {{ diffs: number, snippets: { tags?: string[] }[] }} library
 */
export const isFreshProfile = (stored, library) =>
  !stored && library.diffs === 0 && !library.snippets.some(isOwnSnippet)

const isText = (v) => typeof v === 'string'

const readTours = (raw) =>
  Object.fromEntries(
    Object.entries(raw && typeof raw === 'object' ? raw : {}).filter(([, v]) => ENDED.includes(v))
  )

/**
 * @param {object|null} stored  the parsed onboarding file, null when there is none
 * @param {{ diffs: number, snippets: { tags?: string[] }[] }} library
 * @returns {import('../../types').OnboardingState & { current: boolean }}
 */
export function readOnboarding(stored, library) {
  if (stored?.schema !== SCHEMA) {
    const offer = isFreshProfile(stored, library)
    return { offerTours: true, tours: {}, offer, version: null, known: [], current: false }
  }
  return {
    offerTours: stored.offerTours !== false,
    tours: readTours(stored.tours),
    offer: stored.offer === true,
    version: isText(stored.version) ? stored.version : null,
    known: Array.isArray(stored.known) ? stored.known.filter(isText) : [],
    current: true
  }
}

/** @param {import('../../types').OnboardingState} state */
export const storedOnboarding = ({ offerTours, tours, offer, version, known }) => ({
  schema: SCHEMA,
  offerTours,
  tours,
  offer,
  version,
  known
})

/** @returns {'done'|'skipped'|'never'} */
export const tourStatus = (tours, id) => tours[id] ?? 'never'

export const isOfferOpen = ({ offer, tours }) => offer && tourStatus(tours, 'core') === 'never'

/**
 * @param {Record<string, string>} tours
 * @param {string} id
 * @param {'done'|'skipped'} outcome
 */
export const endedTours = (tours, id, outcome) => ({
  ...tours,
  [id]: tours[id] === 'done' ? 'done' : outcome
})

/** @param {{ query: string, panel: string, name: string }} args */
export function isSampleFound({ query, panel, name }) {
  const typed = String(query ?? '')
    .trim()
    .toLowerCase()
  if (!typed || typed.startsWith('#') || !name) return false
  return DIFF_PANELS.includes(panel) && name.toLowerCase().includes(typed)
}

const versionParts = (v) =>
  String(v)
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)

/** Negative, zero or positive, as `a` is older than, the same as or newer than `b`. */
export function compareVersions(a, b) {
  const [x, y] = [versionParts(a), versionParts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  }
  return 0
}

const installedReleases = (registry, appVersion) =>
  registry.filter((t) => t.release && compareVersions(t.introducedIn, appVersion) <= 0)

// A profile with no version yet knows every release tour so far; with the switch off the version moves on.
/** @returns {{ version: string|null, known: string[] }} */
export function settledReleases({ version, known, offerTours }, registry, appVersion) {
  if (!version) {
    const ids = installedReleases(registry, appVersion).map((t) => t.id)
    return { version: appVersion, known: [...new Set([...known, ...ids])] }
  }
  return { version: offerTours ? version : appVersion, known }
}

/** @returns {string[]} release tours shipped after the version tours were last offered at */
export function pendingReleases(state, registry, appVersion) {
  if (!state.offerTours || !state.version) return []
  return installedReleases(registry, appVersion)
    .filter((t) => compareVersions(t.introducedIn, state.version) > 0)
    .filter((t) => tourStatus(state.tours, t.id) === 'never' && !state.known.includes(t.id))
    .map((t) => t.id)
}

/**
 * @param {string[]} pending
 * @param {{ running: boolean, dialogOpen: boolean, doneCard: boolean }} busy
 */
export const releaseOffer = (pending, { running, dialogOpen, doneCard }) =>
  running || dialogOpen || doneCard ? [] : pending

export const isNewTour = (state, tour, appVersion) =>
  !!tour.release &&
  compareVersions(tour.introducedIn, appVersion) <= 0 &&
  tourStatus(state.tours, tour.id) === 'never' &&
  !state.known.includes(tour.id)

/** @returns {import('../../types').TourRows} */
export function tourRows(state, registry, appVersion) {
  const row = (tour) => ({
    id: tour.id,
    nameKey: tour.nameKey,
    summaryKey: tour.summaryKey,
    hue: tour.hue,
    icon: tour.icon,
    steps: tour.steps.length,
    done: tourStatus(state.tours, tour.id) === 'done',
    isNew: isNewTour(state, tour, appVersion)
  })
  const releases = installedReleases(registry, appVersion)
  const versions = [...new Set(releases.map((t) => t.introducedIn))].sort(compareVersions).reverse()
  return {
    tours: registry.filter((t) => !t.release).map(row),
    releases: versions.map((version) => ({
      version,
      rows: releases.filter((t) => t.introducedIn === version).map(row)
    }))
  }
}
