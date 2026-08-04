// What the tour puts on stage — a comparison worth pointing at, a snippet worth
// keeping, a search term that visibly narrows the library — and `clearStage`,
// which takes all of it away again. Left behind, the demo became the user's own
// unsaved work: restored on the next launch and prompting on the way out.

import { useDiffStore } from '../../stores/diffStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSnippetStore } from '../../stores/snippetStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'

const SNIPPET = {
  name: 'Checkout API — staging',
  language: 'json',
  tags: ['example'],
  content: `{
  "service": "checkout-api",
  "replicas": 3,
  "env": "staging",
  "featureFlags": { "newCart": true, "fastCheckout": false }
}`
}

/** Matches one of the two examples seeded on first run, so the list visibly halves. */
export const SEARCH = 'mermaid'
/** Per character. Slow on purpose: this is a demonstration, not an input. */
export const TYPE_MS = 150
/** A beat before the first letter, so the card is read before the box moves. */
export const TYPE_LEAD_MS = 500

// Module-scoped because the animation is this file's, not a slice of tour
// state: nothing outside reads it, and the store already carries enough.
let typeTimer = null

/**
 * Types the demo query a letter at a time, after a beat. Slow on purpose — this
 * is a demonstration nobody asked for. The box it lands in is marked by the
 * step's own ring, which stays for the whole step rather than vanishing with
 * the last letter.
 */
export function typeSearch() {
  const ui = useUiStore()
  clearFilters()
  let typed = 0
  typeTimer = setTimeout(() => {
    typeTimer = setInterval(() => {
      ui.sidebarQuery = SEARCH.slice(0, (typed += 1))
      if (typed >= SEARCH.length) stopTyping()
    }, TYPE_MS)
  }, TYPE_LEAD_MS)
}

export function stopTyping() {
  clearTimeout(typeTimer)
  clearInterval(typeTimer)
}

export function clearSearch() {
  stopTyping()
  useUiStore().sidebarQuery = ''
}

// The global shortcut ignores itself while Diff Bro is in front, so that the
// Settings capture field can be typed into. This step asks for the press with
// the app in front, so it lifts that for as long as the step is up.
export const allowChord = (on) => window.api.quickLookAllowWhileFocused?.(on)

/** What the tour is about to drive, so `clearStage` can hand it back. */
export function takeFilters() {
  const ui = useUiStore()
  return { query: ui.sidebarQuery, tags: [...ui.sidebarTags] }
}

// A tag filter of the user's can hide the very snippet a step points at, which
// left the ring on the whole section and the copy talking about a row that was
// not there.
export function clearFilters() {
  clearSearch()
  useUiStore().sidebarTags = []
}

/**
 * The demo pair, in a scratch tab of its own.
 * @returns {Promise<string|null>} the tab holding it, null when there is no room
 */
export async function openPair() {
  const tabs = useTabsStore()
  if (!tabs.canHost(true)) return null
  const id = tabs.newTab({ transient: true })
  if (!id) return null
  // Kept out of the saved session as well as closed at the end: quitting
  // mid-tour is the one exit that never reaches `clearStage`.
  const tab = tabs.tabs.find((t) => t.id === id)
  if (tab) tab.ephemeral = true
  try {
    // Contents, not paths: main refuses to read anything back out of userData,
    // which is what stands between a compromised renderer and the vault key.
    const diff = useDiffStore()
    const sides = ['left', 'right']
    for (const [i, file] of ((await window.api.demoFiles()) ?? []).entries()) {
      diff.receive(sides[i], file)
    }
  } catch {
    // No demo pair on disk is not worth a notice mid-tour.
  }
  return id
}

const named = () => useSnippetStore().entries.filter((e) => e.name === SNIPPET.name)

/**
 * A worked example in the snippet editor, named up front — the next step rings
 * Save, and Save stays disabled until a draft has a name.
 *
 * @returns {string[]|null} the demo-named snippets that were ALREADY there, or
 *   null when the editor was the user's. Cleanup removes what is not in that
 *   list, which is the only way to catch the copy made by pressing Save on the
 *   control itself — the hole is live, so the tour never sees that id.
 */
export function openSnippet() {
  const snippets = useSnippetStore()
  if (snippets.editingSnippet) return null
  const before = named().map((e) => e.id)
  snippets.editingSnippet = {
    id: null,
    initialName: SNIPPET.name,
    initialContent: SNIPPET.content,
    initialLanguage: SNIPPET.language,
    initialTags: SNIPPET.tags
  }
  return before
}

export function closeSnippet() {
  useSnippetStore().editingSnippet = null
}

/** @param {{ demoTabId: string|null, editorOwned: string[]|null, sidebarWasCollapsed: boolean }} held */
export function clearStage({ demoTabId, editorOwned, sidebarWasCollapsed, filters }) {
  allowChord(false)
  const ui = useUiStore()
  clearSearch()
  ui.sidebarQuery = filters?.query ?? ''
  ui.sidebarTags = filters?.tags ?? []
  ui.showSettingsDialog = false
  if (demoTabId) useTabsStore().close(demoTabId)
  if (sidebarWasCollapsed) useSettingsStore().setSidebarCollapsed(true)
  if (!editorOwned) return
  closeSnippet()
  // The example was the tour's, not the user's — it goes when the tour does,
  // whether the run finished or was walked out of.
  const snippets = useSnippetStore()
  for (const entry of named()) if (!editorOwned.includes(entry.id)) snippets.remove(entry.id)
}
