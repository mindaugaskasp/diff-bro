import { defineStore } from 'pinia'
import { RUNNABLE_LANGUAGES, SNIPPET_LANGUAGES } from '../../../../shared/snippetLanguages'

export const RUNNER_LANGUAGES = SNIPPET_LANGUAGES.filter((l) => RUNNABLE_LANGUAGES.includes(l.id))

function exitState(reason, code) {
  if (reason === 'stopped') return 'stopped'
  return reason === 'exit' && code === 0 ? 'finished' : 'failed'
}

export const useRunnerStore = defineStore('runner', {
  state: () => ({
    /** @type {Record<string, import('../../types').LanguageStatus>|null} */
    status: null,
    /** @type {{ language: string, error: string|null, notice: string|null }|null} */
    settingsMessage: null,
    /** @type {Record<string, import('../../types').RunState>} one per tab */
    runs: {},
    listening: false
  }),
  getters: {
    errorFor: (s) => (language) =>
      s.settingsMessage?.language === language ? s.settingsMessage.error : null,
    noticeFor: (s) => (language) =>
      s.settingsMessage?.language === language ? s.settingsMessage.notice : null,
    isEnabled: (s) => (language) => s.status?.[language]?.enabled === true,
    runFor: (s) => (key) => s.runs[key] ?? null,
    // A run still waiting for main has no id yet, and its output can arrive first.
    liveRun: (s) => (key, runId) => {
      const run = s.runs[key]
      return run && (run.runId === null || run.runId === runId) ? run : null
    },
    outputText: (s) => (key) => (s.runs[key]?.blocks ?? []).map((b) => b.text).join('')
  },
  actions: {
    async load() {
      this.status = await window.api.runStatus()
    },
    applySettingsReply(language, reply) {
      if (reply?.status) this.status = reply.status
      const error = reply?.error ?? null
      const notice = reply?.notice ?? null
      this.settingsMessage = error || notice ? { language, error, notice } : null
    },
    async enable(language) {
      this.applySettingsReply(language, await window.api.runEnable(language))
    },
    async change(language) {
      this.applySettingsReply(language, await window.api.runChange(language))
    },
    async choose(language, index) {
      this.applySettingsReply(language, await window.api.runChoose(language, index))
    },
    async usePath(language, path) {
      this.applySettingsReply(language, await window.api.runUsePath(language, path))
    },
    async findAgain(language) {
      this.applySettingsReply(language, await window.api.runFindAgain(language))
    },
    async disable(language) {
      this.applySettingsReply(language, await window.api.runDisable(language))
    },
    listen() {
      if (this.listening) return
      this.listening = true
      window.api.onRunOutput((chunk) => this.appendOutput(chunk))
      window.api.onRunExit((exit) => this.markExited(exit))
    },
    async start(key, { language, code, snippetId, line = null, lastLine = null }) {
      this.listen()
      this.stop(key)
      this.runs[key] = {
        runId: null,
        state: 'running',
        language,
        blocks: [],
        version: null,
        line,
        lastLine
      }
      const pending = this.runs[key]
      this.bindStartReply(
        key,
        pending,
        await window.api.runStart({ key, language, code, snippetId })
      )
    },
    // Main answers after the first-run dialog: a Stop or a close may already have come.
    bindStartReply(key, pending, reply) {
      const isStillShown = this.runs[key] === pending
      if (!reply?.runId) {
        if (isStillShown) delete this.runs[key]
        return
      }
      if (!isStillShown || pending.stopAsked) window.api.runStop(reply.runId)
      if (isStillShown) Object.assign(pending, { runId: reply.runId, version: reply.version })
    },
    appendOutput({ key, runId, stream, text }) {
      const run = this.liveRun(key, runId)
      if (!run) return
      const last = run.blocks.at(-1)
      if (last?.stream === stream) last.text += text
      else run.blocks.push({ stream, text })
    },
    markExited({ key, runId, reason, code, ms }) {
      const run = this.liveRun(key, runId)
      if (run) Object.assign(run, { state: exitState(reason, code), reason, code, ms })
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
