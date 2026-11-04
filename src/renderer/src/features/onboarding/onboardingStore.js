import { defineStore } from 'pinia'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { tourById } from './tourRegistry'
import { endedTours, isOfferOpen } from './tourPlan'
import { readProgress, saveProgress } from './onboardingPersist'
import { openSample } from './tourSample'

export const useOnboardingStore = defineStore('onboarding', {
  state: () => ({
    ...readProgress(),
    /** @type {{ id: string, index: number }|null} */
    running: null,
    /** @type {{ tabId: string, files: { name: string, content: string }[] }|null} */
    sample: null,
    sampleEntryId: null,
    doneCard: false
  }),
  getters: {
    tour: (s) => (s.running ? tourById(s.running.id) : null),
    /** @returns {import('../../types').TourStep|null} */
    step() {
      return this.tour?.steps[this.running.index] ?? null
    },
    stepNumber: (s) => (s.running?.index ?? 0) + 1,
    stepCount: () => tourById('core').steps.length,
    isRunning: (s) => !!s.running,
    isOffering: (s) => (s.running ? s.running.index === 0 : isOfferOpen(s))
  },
  actions: {
    init() {
      if (!this.current) this.persist()
    },
    persist() {
      saveProgress(this)
      this.current = true
    },
    /** @param {string} id */
    start(id) {
      this.running = { id, index: 0 }
      this.sample = null
      this.sampleEntryId = null
      this.doneCard = false
    },
    replay() {
      useUiStore().showSettingsDialog = false
      useTabsStore().showStart()
      this.start('core')
    },
    async loadSample() {
      if (!this.running) this.start('core')
      if (this.step?.advanceOn !== 'sample-opened') return
      const sample = await openSample()
      if (!sample) return
      this.sample = sample
      this.advance('sample-opened')
    },
    /** @param {string} event */
    advance(event) {
      if (!this.step || this.step.advanceOn !== event) return
      if (this.running.index < this.tour.steps.length - 1) this.running.index += 1
      else this.finish()
    },
    /** @param {string} entryId */
    noteSampleSaved(entryId) {
      this.sampleEntryId = entryId
      this.advance('sample-saved')
    },
    skip() {
      this._end('skipped')
    },
    finish() {
      this._end('done')
      this.doneCard = true
    },
    _end(outcome) {
      this.tours = endedTours(this.tours, this.running?.id ?? 'core', outcome)
      this.offer = false
      this.running = null
      this.persist()
    },
    noteOwnComparison() {
      if (this.running?.index === 0) this.skip()
      else if (!this.running && this.offer) {
        this.offer = false
        this.persist()
      }
    },
    dismissDone() {
      this.doneCard = false
    },
    setShowTips(value) {
      this.showTips = value !== false
      this.persist()
    }
  }
})
