import { computed, ref, watch } from 'vue'
import { usePopover } from '../../composables/usePopover'
import { useRunnerStore } from './runnerStore'
import {
  canFindAgain,
  foundPrograms,
  hasProgramMenu,
  shownVersion,
  stopAfterFrom,
  typedPathToUse
} from './programField'

/**
 * @param {string} language
 * @param {import('vue').ComputedRef<import('../../types').LanguageStatus|null>} status
 */
export function useProgramField(language, status) {
  const runner = useRunnerStore()
  const draft = ref(status.value?.path ?? '')
  watch(
    () => status.value?.path,
    (path) => (draft.value = path ?? '')
  )
  const menu = usePopover()

  function submit() {
    const path = typedPathToUse(draft.value, status.value)
    if (path) runner.usePath(language, path)
  }
  function choose(index) {
    menu.close()
    runner.choose(language, index)
  }

  return {
    draft,
    version: computed(() => shownVersion(draft.value, status.value)),
    programs: computed(() => foundPrograms(status.value)),
    hasMenu: computed(() => hasProgramMenu(status.value)),
    canFindAgain: computed(() => canFindAgain(status.value)),
    menu,
    submit,
    choose,
    findAgain: () => runner.findAgain(language),
    browse: () => runner.change(language)
  }
}

/**
 * @param {string} language
 * @param {import('vue').ComputedRef<import('../../types').LanguageStatus|null>} status
 */
export function useStopAfter(language, status) {
  const runner = useRunnerStore()
  const minutes = computed(() => status.value?.stopAfterMinutes ?? null)

  /** @param {Event} event */
  function commit(event) {
    const input = /** @type {HTMLInputElement} */ (event.target)
    const next = stopAfterFrom(input.value)
    if (next === null || next === minutes.value) input.value = String(minutes.value ?? '')
    else runner.setStopAfter(language, next)
  }
  return { minutes, commit }
}
