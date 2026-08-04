import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../../persist'
import { useUiStore } from '../../stores/uiStore'
import { TOUR_STEPS, TOUR_VERSION, runBlockAt, tourPlan } from '../../utils/tourSteps'

// Its own persisted key rather than a corner of settingsStore: the tour is one
// slice's state, and the core store is already at its size cap.
const KEY = 'onboarding'
const MAX_DEFER = 2
// Long enough to register as a window, short enough not to interrupt.
const PEEK_MS = 2200
// The beat after step one: the veil lifts so the comparison it just loaded is
// actually SEEN, rather than described through a blur and then replaced.
const REVEAL_MS = 1800

const clampInt = (value, lo, hi) => {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

function readState() {
  let saved
  try {
    saved = JSON.parse(loadPersisted(KEY) ?? '{}') || {}
  } catch {
    saved = {}
  }
  return {
    // Master switch. Off means off for every future version too.
    showTips: saved.showTips !== false,
    // Index of the next unseen step; clamped so a hand-edited file cannot
    // leave the tour pointing past the end of the list.
    tourStep: clampInt(saved.tourStep, 0, TOUR_STEPS.length),
    seenVersion: typeof saved.seenVersion === 'string' ? saved.seenVersion : '',
    // How many times "Not now" has been chosen. Two is the end of asking.
    deferred: clampInt(saved.deferred, 0, MAX_DEFER),
    // Live, not persisted.
    steps: [],
    index: 0,
    active: false,
    promptOpen: false,
    // "Not now" also silences the prompt for the rest of this session.
    asked: false,
    peekTimer: null,
    revealTimer: null,
    // Veil down, tour still running: a pause to look at what step one loaded.
    revealing: false,
    // A replay does not advance the recorded progress.
    replaying: false
  }
}

export const useOnboardingStore = defineStore('onboarding', {
  state: () => readState(),
  getters: {
    currentStep: (s) => s.steps[s.index] ?? null,
    stepCount: (s) => s.steps.length,
    stepNumber: (s) => s.index + 1
  },
  actions: {
    persist() {
      savePersisted(
        KEY,
        JSON.stringify({
          showTips: this.showTips,
          tourStep: this.tourStep,
          seenVersion: this.seenVersion,
          deferred: this.deferred
        })
      )
    },
    // Consulted once per launch. Never starts a later run unannounced.
    begin() {
      if (this.active || this.promptOpen || this.asked) return
      const plan = tourPlan({
        showTips: this.showTips,
        tourStep: this.tourStep,
        seenVersion: this.seenVersion,
        tourDeferred: this.deferred
      })
      if (plan.mode === 'steps') this._open(plan.steps)
      else if (plan.mode === 'prompt') this.promptOpen = true
    },
    _open(steps) {
      if (!steps.length) return
      this.steps = steps
      this.index = 0
      this.active = true
      this.promptOpen = false
    },
    next() {
      if (!this.active || this.revealing) return
      if (this.currentStep?.reveal) {
        this.revealing = true
        this.revealTimer = setTimeout(() => {
          this.revealing = false
          this._step()
        }, REVEAL_MS)
        return
      }
      this._step()
    },
    _step() {
      if (this.index < this.steps.length - 1) {
        this.index += 1
        if (!this.replaying) this._advanceTo(this.tourStep + 1)
        return
      }
      this.finish()
    },
    // Record progress as the user moves, so quitting mid-run resumes there.
    _advanceTo(step) {
      this.tourStep = Math.min(step, TOUR_STEPS.length)
      this.persist()
    },
    // End of a run: close, then ask about the next one if there is one.
    finish() {
      const wasReplaying = this.replaying
      this.active = false
      this.steps = []
      this.index = 0
      this.replaying = false
      if (wasReplaying) return
      this._advanceTo(this.tourStep + 1)
      if (this.tourStep >= TOUR_STEPS.length) {
        this.seenVersion = TOUR_VERSION
        this.persist()
        return
      }
      if (runBlockAt(this.tourStep).length) this.promptOpen = true
    },
    // Leaving early is an answer, not a pause — including for every later run.
    // Guarded because Escape reaches here from a listener that outlives the
    // tour: without it, every Escape in the app turned tips off and wrote.
    skip() {
      if (!this.active) return
      clearTimeout(this.revealTimer)
      this.revealing = false
      this.active = false
      this.promptOpen = false
      this.steps = []
      this.index = 0
      this.replaying = false
      this.showTips = false
      this.persist()
    },
    acceptPrompt() {
      this.promptOpen = false
      this._open(runBlockAt(this.tourStep))
    },
    // One reminder is a reminder; two is pestering. `asked` keeps it quiet for
    // the rest of THIS session as well.
    deferPrompt() {
      this.promptOpen = false
      this.asked = true
      this.deferred = Math.min(this.deferred + 1, MAX_DEFER)
      this.persist()
    },
    // Summoned deliberately: plays everything, ignores every flag, and does not
    // read a request to see it once as consent to automatic tips.
    replay() {
      // Both ways in are inside Settings — its own button, and the shortcut the
      // tour then points at — so leaving it open puts step one behind it.
      useUiStore().showSettingsDialog = false
      this.replaying = true
      this._open([...TOUR_STEPS])
    },
    setShowTips(value) {
      this.showTips = value !== false
      this.persist()
    },
    // Shows the launcher for a moment so it is a thing the user has SEEN, then
    // takes it away again. Deliberately not a "now you try it" gate: the whole
    // point is a fast orientation, and the global chord can be taken by another
    // app, which would turn one step into a dead end.
    peekQuickLook() {
      clearTimeout(this.peekTimer)
      window.api?.quickLookToggle?.()
      this.peekTimer = setTimeout(() => window.api?.quickLookHide?.(), PEEK_MS)
    }
  }
})
