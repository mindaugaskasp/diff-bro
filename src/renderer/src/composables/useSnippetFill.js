import { ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useUiStore } from '../stores/uiStore'
import { fillTemplate, parseTemplateVars } from '../utils/templateVars'
import { presetFills } from '../utils/snippetTemplates'
import { t } from '../i18n'

// A blank left empty is copied as written.
export function useSnippetFill() {
  const store = useSnippetStore()
  const pending = store.pendingFill ?? { content: '' }
  const name = pending.name ?? 'snippet'
  const vars = parseTemplateVars(pending.content)
  const blanks = Object.fromEntries(vars.map((v) => [v, '']))
  const values = ref(
    useUiStore().prefillFillDates
      ? presetFills(vars, { locale: useSettingsStore().activeLocale })
      : blanks
  )

  const close = () => (store.pendingFill = null)
  async function copyFilled() {
    await window.api.copyText(fillTemplate(pending.content, values.value))
    useDiffStore().showNotice(t('snippetFillDialog.copied', { name }))
    useUiStore().lastSnippetFill = { snippetId: pending.snippetId ?? null }
    close()
  }
  return { name, vars, values, copyFilled, close }
}
