import { compareVersions } from './tourPlan'

const isText = (v) => typeof v === 'string'
const texts = (v) => (Array.isArray(v) ? v.filter(isText) : [])
const pad = (n) => String(n).padStart(2, '0')

/** @param {Date} date */
export const localDay = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/**
 * @param {object|null|undefined} raw
 * @param {{ since?: string|null }} [fresh]  the day a fresh install began
 * @returns {import('../../types').TipState}
 */
export function readTips(raw, { since = null } = {}) {
  const stored = raw && typeof raw === 'object' ? raw : {}
  return {
    on: stored.on !== false,
    known: texts(stored.known),
    seen: texts(stored.seen),
    shownOn: isText(stored.shownOn) ? stored.shownOn : null,
    since: isText(stored.since) ? stored.since : since
  }
}

/** @param {import('../../types').TipState} tips */
export const isTipDue = (tips, today) => tips.on && tips.shownOn !== today

/**
 * @param {{ running: boolean, doneCard: boolean, releaseCard: boolean, dialogOpen: boolean,
 *   offering: boolean, firstDay: boolean }} busy
 */
export const isTipQuiet = ({ running, doneCard, releaseCard, dialogOpen, offering, firstDay }) =>
  !running && !doneCard && !releaseCard && !dialogOpen && !(offering && firstDay)

const minorOf = (version) => String(version).split('.').slice(0, 2).join('.')

/** @returns {string[]} the tips still to show, the running release's first */
export function tipQueue(tips, registry, appVersion) {
  const open = registry
    .filter((t) => !t.release || compareVersions(t.introducedIn, appVersion) <= 0)
    .filter((t) => !tips.seen.includes(t.id) && !tips.known.includes(t.id))
  const isFront = (t) => t.release && minorOf(t.introducedIn) === minorOf(appVersion)
  const front = open.filter(isFront).sort((a, b) => compareVersions(b.introducedIn, a.introducedIn))
  return [...front, ...open.filter((t) => !isFront(t))].map((t) => t.id)
}

export const presentedTips = (tips, id, today) => ({
  ...tips,
  seen: [...new Set([...tips.seen, id])],
  shownOn: today
})

export const knewTip = (tips, id) => ({ ...tips, known: [...new Set([...tips.known, id])] })

export const broughtBackTips = (tips) => ({
  ...tips,
  known: [],
  seen: tips.seen.filter((id) => !tips.known.includes(id))
})
