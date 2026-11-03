import { defineStore } from 'pinia'

export const RUNNER_LANGUAGES = [
  { id: 'php', labelKey: 'language.php' },
  { id: 'python', labelKey: 'language.python' }
]

/**
 * @typedef {object} RunState
 * @property {string|null} runId  null until main has answered
 * @property {'running'|'finished'|'failed'|'stopped'} state
 * @property {string} language
 * @property {{ stream: 'out'|'err', text: string }[]} blocks
 * @property {string|null} version
 */

function stateOf(reason, code) {
  if (reason === 'stopped') return 'stopped'
  return reason === 'exit' && code === 0 ? 'finished' : 'failed'
}

export const useRunnerStore = defineStore('runner', {
  state: () => ({
    /** @type {Record<string, { enabled: boolean, path: string|null, version: string|null }>|null} */
    status: null,
    /** @type {{ language: string, error: string }|null} */
    settingsError: null,
    /** @type {Record<string, RunState>} one per tab */
    runs: {},
    listening: false
  }),
  getters: {
    errorFor: (s) => (language) =>
      s.settingsError?.language === language ? s.settingsError.error : null,
    canRun: (s) => (language) => s.status?.[language]?.enabled === true,
    runFor: (s) => (key) => s.runs[key] ?? null,
    outputText: (s) => (key) => (s.runs[key]?.blocks ?? []).map((b) => b.text).join('')
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
    },
    listen() {
      if (this.listening) return
      this.listening = true
      window.api.onRunOutput((chunk) => this.receive(chunk))
      window.api.onRunExit((exit) => this.finish(exit))
    },
    async run(key, { language, code, snippetId }) {
      this.listen()
      this.stop(key)
      this.runs[key] = { runId: null, state: 'running', language, blocks: [], version: null }
      const mine = this.runs[key]
      const reply = await window.api.runStart({ key, language, code, snippetId })
      this.adopt(key, mine, reply)
    },
    // Main answers after the first-run dialog: a Stop or a close may already have come.
    adopt(key, mine, reply) {
      const stillShown = this.runs[key] === mine
      if (!reply?.runId) {
        if (stillShown) delete this.runs[key]
        return
      }
      if (!stillShown || mine.stopAsked) window.api.runStop(reply.runId)
      if (stillShown) Object.assign(mine, { runId: reply.runId, version: reply.version })
    },
    // Null before main has answered: output can overtake the reply.
    current(key, runId) {
      const run = this.runs[key]
      return run && (run.runId === null || run.runId === runId) ? run : null
    },
    receive({ key, runId, stream, text }) {
      const run = this.current(key, runId)
      if (!run) return
      const last = run.blocks.at(-1)
      if (last?.stream === stream) last.text += text
      else run.blocks.push({ stream, text })
    },
    finish({ key, runId, reason, code, ms }) {
      const run = this.current(key, runId)
      if (run) Object.assign(run, { state: stateOf(reason, code), reason, code, ms })
    },
    stop(key) {
      const run = this.runs[key]
      if (run?.state !== 'running') return
      if (run.runId) window.api.runStop(run.runId)
      else run.stopAsked = true
    },
    clear(key) {
      if (this.runs[key]) this.runs[key].blocks = []
    },
    close(key) {
      this.stop(key)
      delete this.runs[key]
    }
  }
})
