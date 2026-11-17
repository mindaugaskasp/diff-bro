import { blankSnapshot } from '../../utils/tabs'
import { cleanTag } from '../../utils/snippetState'
import { useTabsStore } from '../../stores/tabsStore'

// `lan/<sender>`: the sender nests under lan, and a slash in their name must not nest deeper.
export const receivedTag = (from) => cleanTag(`lan/${String(from ?? '').replace(/\//g, '-')}`)

const snippetDraft = ({ name, snippet }, tags) => ({
  id: null,
  initialName: name,
  initialContent: snippet.content,
  initialLanguage: snippet.language ?? 'auto',
  initialTags: [...(snippet.tags ?? []), ...tags]
})

export function openReceivedEntry(entry, from) {
  const tabs = useTabsStore()
  const tags = from ? [receivedTag(from)] : []
  if (entry.kind === 'snippet') return tabs.openSnippet(snippetDraft(entry, tags), entry.name)
  const id = tabs.open({ ...blankSnapshot(), ...entry.snapshot }, { name: entry.name })
  const tab = tabs.tabs.find((t) => t.id === id)
  if (tab) tab.suggestedTags = tags
  return id
}

export const arePopupsShown = ({ popups, silencedUntil }, now = Date.now()) =>
  popups && silencedUntil <= now

export const withoutId = (list, id) => list.filter((x) => (x.id ?? x) !== id)
