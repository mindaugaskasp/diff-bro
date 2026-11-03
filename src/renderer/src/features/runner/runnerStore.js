import { defineStore } from 'pinia'

export const RUNNER_LANGUAGES = [
  { id: 'php', labelKey: 'language.php' },
  { id: 'python', labelKey: 'language.python' }
]

export const useRunnerStore = defineStore('runner', {
  state: () => ({
    /** @type {Record<string, { enabled: boolean, path: string|null, version: string|null }>|null} */
    status: null,
    /** @type {{ language: string, error: string }|null} */
    settingsError: null
  }),
  getters: {
    errorFor: (s) => (language) =>
      s.settingsError?.language === language ? s.settingsError.error : null
  },
  actions: {
    async load() {
      this.status = await window.api.runStatus()
    },
    settle(language, reply) {
      if (reply?.status) this.status = reply.status
      this.settingsError = reply?.error ? { language, error: reply.error } : null
    },
    async enable(language) {
      this.settle(language, await window.api.runEnable(language))
    },
    async change(language) {
      this.settle(language, await window.api.runChange(language))
    },
    async disable(language) {
      this.settle(language, await window.api.runDisable(language))
    }
  }
})
