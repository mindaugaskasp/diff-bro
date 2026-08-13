import { computed } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { useUiStore } from '../stores/uiStore'
import { useCopyFeedback } from './useCopyFeedback'
import { firstClaudeUrl } from '../utils/detectLanguage'
import { parseTemplateVars } from '../utils/templateVars'
import { t } from '../i18n'

// What a snippet row's buttons DO, out of the row that draws them. Every one of
// them loads the content on demand: a row holds metadata, never plaintext.

/**
 * @param {() => import('../types').SnippetEntry} entry  the row's snippet
 * @returns {object} the row's actions plus the copy-flash state
 */
export function useSnippetRowActions(entry) {
  const store = useSnippetStore()
  const diff = useDiffStore()
  const ui = useUiStore()
  const { copied, flash } = useCopyFeedback()
  const lang = computed(() => languageOf(entry()))

  async function copySnippet() {
    const content = await store.load(entry().id)
    if (content == null) return
    // A Claude prompt with placeholders routes through the fill dialog first.
    if (lang.value === 'claude' && parseTemplateVars(content).length) {
      store.pendingFill = { name: entry().name, content }
      return
    }
    const res = await window.api.copyText(content)
    if (!res?.ok) return diff.showNotice(t('snippetRow.copyFailed'))
    flash()
  }

  async function viewDiagram() {
    const code = await store.load(entry().id)
    if (code != null) ui.openMermaid(entry().name, code)
  }

  // A URL snippet is the whole link; main fences the scheme and confirms.
  async function openUrl() {
    const content = await store.load(entry().id)
    const url = content?.trim().split(/\s+/)[0]
    const res = url ? await window.api.openLink(url) : { error: 'empty' }
    if (res?.error) diff.showNotice(t('snippetRow.noOpenableLink'))
  }

  // Opening is gated by the main-process claude.ai allowlist; this only offers a
  // candidate URL from the snippet.
  async function openLink() {
    const content = await store.load(entry().id)
    const url = content != null ? firstClaudeUrl(content) : null
    if (url) await window.api.openClaudeLink(url)
    else diff.showNotice(t('snippetRow.noClaudeLink'))
  }

  return { copied, copySnippet, viewDiagram, openUrl, openLink }
}
