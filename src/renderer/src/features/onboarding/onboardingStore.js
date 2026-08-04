import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../../persist'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUiStore } from '../../stores/uiStore'
import { TOUR_STEPS, TOUR_VERSION, runBlockAt, tourPlan } from '../../utils/tourSteps'
import * as demo from './tourDemo'

// Its own persisted key rather than a corner of settingsStore: the tour is one
// slice's state, and the core store is already at its size cap.
const KEY = 'onboarding'
const MAX_DEFER = 2
// The beat after step one: the veil lifts so the comparison it just loaded is
// actually SEEN rather than described through a blur. Just long enough to
// register — past about half a second the next card reads as late.
const REVEAL_MS = 450

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
    revealTimer: null,
    // Veil down, tour still running: a pause to look at what step one loaded.
    revealing: false,
    // A step's command, waiting for useTourCommands to run it.
    pendingCommand: null,
    // What the tour opened and therefore has to put back. `editorOwned` holds
    // the demo-named snippets that predate it, so cleanup spares only those.
    demoTabId: null,
    editorOwned: null,
    sidebarWasCollapsed: false,
    filters: null,
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
      // A run summoned during step one's reveal beat would otherwise inherit
      // both the raised veil and the timer that is about to advance it.
      clearTimeout(this.revealTimer)
      this.revealing = false
      const settings = useSettingsStore()
      // Half the run points into the sidebar; collapsed, it teaches nothing.
      this.sidebarWasCollapsed = settings.sidebarCollapsed
      settings.setSidebarCollapsed(false)
      this.filters = demo.takeFilters()
      this.steps = steps
      this.index = 0
      this.active = true
      this.promptOpen = false
      this._dispatch(this.currentStep?.enter)
    },
    // Reaching the registry from here would close a cycle through this slice's
    // index, so useTourCommands watches and dispatches. A fresh object each
    // time, or the same command twice would look like no change.
    _dispatch(action) {
      if (action) this.pendingCommand = { action }
    },
    // Next PERFORMS the step's action, rather than the next step arriving to
    // find a window already open.
    next() {
      if (!this.active || this.revealing) return
      const step = this.currentStep
      this._dispatch(step?.advance)
      this._dispatch(step?.leave)
      if (step?.reveal) {
        this.revealing = true
        this.revealTimer = setTimeout(() => {
          this.revealing = false
          this._step()
        }, REVEAL_MS)
        return
      }
      this._step()
    },
    // A step whose Next opened something carries the `undo` that closes it
    // again: without it, Back left Settings over the control it returns to.
    back() {
      if (!this.active || this.revealing || this.index === 0) return
      // A step is left the same way in both directions: what it did on arrival
      // is undone whether you move on or step back off it.
      this._dispatch(this.currentStep?.leave)
      this.index -= 1
      this._dispatch(this.currentStep?.undo)
      this._dispatch(this.currentStep?.enter)
      if (!this.replaying) this._advanceTo(this.tourStep - 1)
    },
    _step() {
      if (this.index < this.steps.length - 1) {
        this.index += 1
        this._dispatch(this.currentStep?.enter)
        if (!this.replaying) this._advanceTo(this.tourStep + 1)
        return
      }
      this.finish()
    },
    // Record progress as the user moves, so quitting mid-run resumes there.
    _advanceTo(step) {
      this.tourStep = clampInt(step, 0, TOUR_STEPS.length)
      this.persist()
    },
    // End of a run: close, then ask about the next one if there is one.
    finish() {
      const wasReplaying = this.replaying
      this._tidy()
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
      this._tidy()
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
    _tidy() {
      demo.clearStage(this)
      this.demoTabId = null
      this.editorOwned = null
      this.sidebarWasCollapsed = false
      this.filters = null
    },
    // Something to point AT: the file slots teach nothing while they are empty.
    async openDemo() {
      if (this.demoTabId) return
      this.demoTabId = await demo.openPair()
    },
    openSnippet() {
      // Keeps the FIRST ownership record across a back-and-forward: it is the
      // list cleanup spares, and re-taking it after a save would spare that too.
      const owned = demo.openSnippet()
      if (owned && !this.editorOwned) this.editorOwned = owned
    },
    closeSnippet() {
      demo.closeSnippet()
    },
    typeSearch: () => demo.typeSearch(),
    clearSearch: () => demo.clearSearch(),
    clearFilters: () => demo.clearFilters(),
    armChord: () => demo.allowChord(true),
    disarmChord: () => demo.allowChord(false),
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
    }
  }
})
