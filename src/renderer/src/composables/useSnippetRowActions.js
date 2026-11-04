import { languageOf, useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { useUiStore } from '../stores/uiStore'
import { firstClaudeUrl } from '../utils/claudeLink'
import { fillVars } from '../utils/templateVars'
import { t } from '../i18n'

// What a snippet row's buttons DO, out of the row that draws them. Every one of
// them loads the content on demand: a row holds metadata, never plaintext.

/**
 * @param {() => import('../types').SnippetEntry} entry  the row's snippet
 * @returns {object} the row's actions
 */
export function useSnippetRowActions(entry) {
  const store = useSnippetStore()
  const diff = useDiffStore()
  const ui = useUiStore()

  async function copySnippet() {
    const content = await store.load(entry().id)
    if (content == null) return
    if (fillVars(languageOf(entry()), content).length) {
      store.pendingFill = { name: entry().name, content, snippetId: entry().id }
      return
    }
    const res = await window.api.copyText(content)
    if (!res?.ok) return diff.showNotice(t('snippetRow.copyFailed'))
    ui.showSidebarNotice(t('snippetRow.copiedNotice', { name: entry().name }))
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

  return { copySnippet, viewDiagram, openUrl, openLink }
}
