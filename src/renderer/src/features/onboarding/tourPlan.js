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

const readTours = (raw) =>
  Object.fromEntries(
    Object.entries(raw && typeof raw === 'object' ? raw : {}).filter(([, v]) => ENDED.includes(v))
  )

/**
 * @param {object|null} stored  the parsed onboarding file, null when there is none
 * @param {{ diffs: number, snippets: { tags?: string[] }[] }} library
 * @returns {{ showTips: boolean, tours: Record<string, string>, offer: boolean, current: boolean }}
 */
export function readOnboarding(stored, library) {
  const showTips = stored?.showTips !== false
  if (stored?.schema === SCHEMA) {
    return { showTips, tours: readTours(stored.tours), offer: stored.offer === true, current: true }
  }
  return { showTips, tours: {}, offer: isFreshProfile(stored, library), current: false }
}

/** @param {{ showTips: boolean, tours: Record<string, string>, offer: boolean }} state */
export const storedOnboarding = ({ showTips, tours, offer }) => ({
  schema: SCHEMA,
  showTips,
  tours,
  offer
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
