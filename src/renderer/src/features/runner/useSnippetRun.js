import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRunnerStore } from './runnerStore'
import { codeThrough, runnableLines } from './runRange'
import { useRunGutter } from './useRunGutter'

/**
 * Running one snippet tab: what is on screen, saved or not.
 * @param {{ tab: { id: string }, draft: object, editing: { id?: string|null }, editor?: { editorInstance: () => object|null, ready: import('vue').Ref<boolean> } }} o
 */
export function useSnippetRun({ tab, draft, editing, editor }) {
  const runner = useRunnerStore()
  onMounted(() => {
    if (!runner.status) runner.load()
  })
  onBeforeUnmount(() => runner.close(tab.id))

  const current = computed(() => runner.runFor(tab.id))
  const available = computed(() => runner.canRun(draft.language.value))
  const secret = computed(() => !!draft.secret.value)
  const launch = (code, scope = {}) =>
    runner.run(tab.id, {
      language: draft.language.value,
      code,
      snippetId: editing.id ?? null,
      ...scope
    })
  const start = () => launch(draft.content.value)
  const rangeFor = (line) => codeThrough(draft.language.value, draft.content.value, line)
  function startLine(line) {
    const range = rangeFor(line)
    if (range) launch(range.code, { line, upTo: range.last })
  }

  const api = {
    key: tab.id,
    available,
    secret,
    runnable: computed(() =>
      available.value && !secret.value
        ? runnableLines(draft.language.value, draft.content.value)
        : new Set()
    ),
    reachOf: (line) => rangeFor(line)?.last ?? null,
    startLine,
    again: () => (current.value?.line ? startLine(current.value.line) : start()),
    hasCode: computed(() => !!draft.content.value.trim()),
    running: computed(() => current.value?.state === 'running'),
    showing: computed(() => !!current.value),
    start,
    stop: () => runner.stop(tab.id)
  }
  if (editor) api.gutter = useRunGutter({ ...editor, run: api })
  return api
}
