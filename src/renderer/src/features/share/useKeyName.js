import { computed } from 'vue'
import { t } from '../../i18n'
import {
  MAX_KEY_NAME,
  keyNameLength,
  keyNameProblem,
  normalizeKeyName,
  takenBy
} from '../../../../shared/keyName'

/**
 * @param {import('vue').Ref<string>} name
 * @param {{ trusted?: () => object[], fingerprint?: () => string | null }} [clash]
 */
export function useKeyName(name, { trusted, fingerprint } = {}) {
  const clashWith = computed(() =>
    trusted ? takenBy(trusted(), name.value, fingerprint?.() ?? null) : null
  )
  const problem = computed(() => keyNameProblem(name.value) ?? (clashWith.value ? 'taken' : null))
  const count = computed(() =>
    t('keyName.counter', { n: keyNameLength(normalizeKeyName(name.value)), max: MAX_KEY_NAME })
  )
  const message = computed(() => {
    if (problem.value === 'empty') return t('keyName.empty')
    if (problem.value === 'too-long') return t('keyName.tooLong', { max: MAX_KEY_NAME })
    if (problem.value === 'taken') return t('keyName.taken', { name: clashWith.value.label })
    return ''
  })
  return { problem, count, message }
}
