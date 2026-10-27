import { defineStore } from 'pinia'

/**
 * @typedef {object} OpenWithPrompt
 * @property {string} previous  name of the file whose tab is still open
 * @property {string} next      name of the file just opened
 */

export const useOpenWithStore = defineStore('openWith', {
  state: () => ({
    /** @type {OpenWithPrompt|null} */
    prompt: null,
    /** @type {((choice: 'compare'|'tab') => void)|null} */
    settle: null
  }),
  actions: {
    /**
     * @param {OpenWithPrompt} prompt
     * @returns {Promise<'compare'|'tab'>}
     */
    ask(prompt) {
      this.settle?.('tab')
      this.prompt = prompt
      return new Promise((resolve) => {
        this.settle = resolve
      })
    },
    /** @param {'compare'|'tab'} choice */
    choose(choice) {
      const settle = this.settle
      this.prompt = null
      this.settle = null
      settle?.(choice)
    }
  }
})
