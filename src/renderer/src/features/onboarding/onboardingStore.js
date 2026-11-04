import { defineStore } from 'pinia'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { writeTabContent } from '../../utils/tabContent'
import { SAMPLE_LINE, tourById } from './tourRegistry'
import { endedTours, isOfferOpen } from './tourPlan'
import { readProgress, saveProgress } from './onboardingPersist'
import { openSample } from './tourSample'
import { prepareTour } from './tourPrep'

export const useOnboardingStore = defineStore('onboarding', {
  state: () => ({
    ...readProgress(),
    /** @type {{ id: string, index: number, tabId: string|null }|null} */
    running: null,
    /** @type {{ tabId: string, files: { name: string, content: string }[] }|null} */
    sample: null,
    sampleEntryId: null,
    /** @type {{ example: string, v2: string }|null} */
    examples: null,
    snippetId: null,
    /** @type {string|null} the tour whose closing card is up */
    doneCard: null
  }),
  getters: {
    tour: (s) => (s.running ? tourById(s.running.id) : null),
    /** @returns {import('../../types').TourStep|null} */
    step() {
      return this.tour?.steps[this.running.index] ?? null
    },
    stepNumber: (s) => (s.running?.index ?? 0) + 1,
    stepCount() {
      return (this.tour ?? tourById('core')).steps.length
    },
    labelKey() {
      return (this.tour ?? tourById('core')).labelKey
    },
    tourTabId: (s) => s.running?.tabId ?? null,
    isRunning: (s) => !!s.running,
    isOffering: (s) =>
      s.running ? s.running.id === 'core' && s.running.index === 0 : isOfferOpen(s)
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
      this.running = { id, index: 0, tabId: null }
      this.sample = null
      this.sampleEntryId = null
      this.examples = null
      this.snippetId = null
      this.doneCard = null
      useUiStore().prefillFillDates = id === 'snippets'
    },
    replay() {
      useUiStore().showSettingsDialog = false
      useTabsStore().showStart()
      this.start('core')
    },
    /** @param {string} id  a tour that runs in the sidebar, like Snippets or Diagrams */
    async startTour(id) {
      this.doneCard = null
      const prepared = await prepareTour(id)
      if (!prepared) return
      this.start(id)
      this.examples = prepared.examples ?? null
    },
    async loadSample() {
      if (!this.running) this.start('core')
      if (this.step?.advanceOn !== 'sample-opened') return
      const sample = await openSample()
      if (!sample) return
      this.sample = sample
      this.noteTourTab(sample.tabId, 'sample-opened')
    },
    /** @param {string} event */
    advance(event) {
      if (!this.step || this.step.advanceOn !== event) return
      if (this.running.index < this.tour.steps.length - 1) this.running.index += 1
      else this.finish()
    },
    /** @param {string} tabId  the tab the next steps happen in */
    noteTourTab(tabId, event) {
      if (this.step?.advanceOn !== event) return
      this.running.tabId = tabId
      this.advance(event)
    },
    /** @param {string} entryId */
    noteSampleSaved(entryId) {
      this.sampleEntryId = entryId
      this.advance('sample-saved')
    },
    /** @param {string} id */
    noteSnippetSaved(id) {
      this.snippetId = id
      this.advance('snippet-saved')
    },
    fillSample() {
      if (this.tourTabId) writeTabContent(this.tourTabId, SAMPLE_LINE)
    },
    skip() {
      this._end('skipped')
    },
    finish() {
      const card = this.tour?.doneCard ? this.running.id : null
      this._end('done')
      this.doneCard = card
    },
    _end(outcome) {
      this.tours = endedTours(this.tours, this.running?.id ?? 'core', outcome)
      if (!this.running || this.running.id === 'core') this.offer = false
      this.running = null
      useUiStore().prefillFillDates = false
      this.persist()
    },
    noteOwnComparison() {
      if (this.running?.id === 'core' && this.running.index === 0) this.skip()
      else if (this.running?.id !== 'core' && this.offer) {
        this.offer = false
        this.persist()
      }
    },
    dismissDone() {
      this.doneCard = null
    },
    setShowTips(value) {
      this.showTips = value !== false
      this.persist()
    }
  }
})
