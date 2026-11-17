import { blankSnapshot } from '../../utils/tabs'
import { useTabsStore } from '../../stores/tabsStore'

const snippetDraft = ({ name, snippet }) => ({
  id: null,
  initialName: name,
  initialContent: snippet.content,
  initialLanguage: snippet.language ?? 'auto',
  initialTags: snippet.tags ?? []
})

export function openReceivedEntry(entry) {
  const tabs = useTabsStore()
  return entry.kind === 'snippet'
    ? tabs.openSnippet(snippetDraft(entry), entry.name)
    : tabs.open({ ...blankSnapshot(), ...entry.snapshot }, { name: entry.name })
}

export const arePopupsShown = ({ popups, silencedUntil }, now = Date.now()) =>
  popups && silencedUntil <= now

export const withoutId = (list, id) => list.filter((x) => (x.id ?? x) !== id)
