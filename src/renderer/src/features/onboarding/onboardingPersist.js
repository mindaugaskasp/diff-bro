import { loadPersistedJson, savePersisted } from '../../persist'
import { TOUR_STEPS } from '../../utils/tourSteps'

// Its own persisted key rather than a corner of settingsStore: the tour is one
// slice's state, and the core store is already at its size cap.
const KEY = 'onboarding'
export const MAX_DEFER = 2

export const clampInt = (value, lo, hi) => {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

/** @returns {{ showTips: boolean, tourStep: number, seenVersion: string, deferred: number }} */
export function readProgress() {
  const saved = loadPersistedJson(KEY)
  return {
    // Off means off for every future version too.
    showTips: saved.showTips !== false,
    // Clamped so a hand-edited file cannot point past the end of the list.
    tourStep: clampInt(saved.tourStep, 0, TOUR_STEPS.length),
    seenVersion: typeof saved.seenVersion === 'string' ? saved.seenVersion : '',
    deferred: clampInt(saved.deferred, 0, MAX_DEFER)
  }
}

/** @param {{ showTips: boolean, tourStep: number, seenVersion: string, deferred: number }} progress */
export function saveProgress({ showTips, tourStep, seenVersion, deferred }) {
  savePersisted(KEY, JSON.stringify({ showTips, tourStep, seenVersion, deferred }))
}
