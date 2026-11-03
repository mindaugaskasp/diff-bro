import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRunnerStore } from './runnerStore'
import { codeThrough, lastLineFor, runnableLines } from './runRange'
import { useRunGutter } from './useRunGutter'

/**
 * Running one snippet tab: what is on screen, saved or not.
 * @param {object} o
 * @param {{ id: string }} o.tab
 * @param {object} o.draft  useSnippetDraft's return
 * @param {{ id?: string|null }} o.editing
 * @param {() => object|null} o.editorInstance  the Monaco editor, once created
 * @param {import('vue').Ref<boolean>} o.ready
 * @returns {import('../../types').SnippetRun}
 */
export function useSnippetRun({ tab, draft, editing, editorInstance, ready }) {
  const runner = useRunnerStore()
  onMounted(() => {
    if (!runner.status) runner.load()
  })
  onBeforeUnmount(() => runner.close(tab.id))

  const current = computed(() => runner.runFor(tab.id))
  const canRun = computed(() => runner.isEnabled(draft.language.value))
  const isSecret = computed(() => !!draft.secret.value)
  const launch = (code, origin = {}) =>
    runner.start(tab.id, {
      language: draft.language.value,
      code,
      snippetId: editing.id ?? null,
      ...origin
    })
  const start = () => launch(draft.content.value)
  function startLine(line) {
    const range = codeThrough(draft.language.value, draft.content.value, line)
    if (range) launch(range.code, { line, lastLine: range.lastLine })
  }
  const runnable = computed(() =>
    canRun.value && !isSecret.value
      ? runnableLines(draft.language.value, draft.content.value)
      : new Set()
  )
  const lastLineOf = (line) => lastLineFor(draft.language.value, draft.content.value, line)

  return {
    canRun,
    isSecret,
    hasCode: computed(() => !!draft.content.value.trim()),
    isRunning: computed(() => current.value?.state === 'running'),
    runnableLines: runnable,
    lastLineFor: lastLineOf,
    start,
    startLine,
    runAgain: () => (current.value?.line ? startLine(current.value.line) : start()),
    stop: () => runner.stop(tab.id),
    gutter: useRunGutter({
      editorInstance,
      ready,
      runnableLines: runnable,
      lastLineFor: lastLineOf,
      startLine
    })
  }
}
