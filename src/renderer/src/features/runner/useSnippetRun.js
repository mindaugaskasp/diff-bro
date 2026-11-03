import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRunnerStore } from './runnerStore'

/**
 * Running one snippet tab: what is on screen, saved or not.
 * @param {{ tab: { id: string }, draft: object, editing: { id?: string|null } }} o
 */
export function useSnippetRun({ tab, draft, editing }) {
  const runner = useRunnerStore()
  onMounted(() => {
    if (!runner.status) runner.load()
  })
  onBeforeUnmount(() => runner.close(tab.id))

  const current = computed(() => runner.runFor(tab.id))
  const start = () =>
    runner.run(tab.id, {
      language: draft.language.value,
      code: draft.content.value,
      snippetId: editing.id ?? null
    })

  return {
    key: tab.id,
    available: computed(() => runner.canRun(draft.language.value)),
    secret: computed(() => !!draft.secret.value),
    hasCode: computed(() => !!draft.content.value.trim()),
    running: computed(() => current.value?.state === 'running'),
    showing: computed(() => !!current.value),
    start,
    stop: () => runner.stop(tab.id)
  }
}
