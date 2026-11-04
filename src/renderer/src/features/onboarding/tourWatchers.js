import { watch } from 'vue'
import { useDiffStore } from '../../stores/diffStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { isSnippetTab } from '../../utils/tabs'
import { tabContent } from '../../utils/tabContent'
import { parseTemplateVars } from '../../utils/templateVars'

const isNewSnippetTab = (tab) => isSnippetTab(tab) && !tab.snippet.id

function waitingFor(tour, event) {
  return tour.step?.advanceOn === event
}

export function watchSnippetsTour(tour) {
  const tabs = useTabsStore()
  const ui = useUiStore()
  const tourTab = () => tabs.tabs.find((t) => t.id === tour.tourTabId) ?? null

  // Only a tab that appears while the step waits: a draft already open does not count.
  watch(
    () => (waitingFor(tour, 'snippet-opened') ? tabs.tabs.filter(isNewSnippetTab) : null),
    (now, before) => {
      const opened = before && now?.find((tab) => !before.includes(tab))
      if (opened) tour.noteTourTab(opened.id, 'snippet-opened')
    }
  )
  // Read only once the tab is dirty: the reader is not reactive until the
  // document mounts, and nothing can hold a blank before it is typed.
  watch(
    () =>
      waitingFor(tour, 'snippet-blank') &&
      !!tourTab()?.dirty &&
      parseTemplateVars(tabContent(tour.tourTabId)?.content).length > 0,
    (typed) => typed && tour.advance('snippet-blank')
  )
  watch(
    () => waitingFor(tour, 'snippet-saved') && tourTab()?.snippet.id,
    (id) => id && tour.noteSnippetSaved(id)
  )
  watch(
    () => ui.lastSnippetFill,
    (fill) =>
      waitingFor(tour, 'snippet-filled') &&
      fill?.snippetId === tour.snippetId &&
      tour.advance('snippet-filled')
  )
}

export function watchDiagramsTour(tour) {
  const tabs = useTabsStore()
  const diff = useDiffStore()
  const ids = () => tour.examples ?? {}

  watch(
    () =>
      waitingFor(tour, 'diagram-opened') &&
      isSnippetTab(tabs.active) &&
      tabs.active.snippet.id === ids().example,
    (opened) => opened && tour.noteTourTab(tabs.activeId, 'diagram-opened')
  )
  watch(
    () =>
      waitingFor(tour, 'diagram-compared') &&
      !isSnippetTab(tabs.active) &&
      diff.left?.snippetId === ids().example,
    (compared) => compared && tour.noteTourTab(tabs.activeId, 'diagram-compared')
  )
  watch(
    () =>
      waitingFor(tour, 'diagram-dropped') &&
      tabs.activeId === tour.tourTabId &&
      diff.left?.snippetId === ids().example &&
      diff.right?.snippetId === ids().v2,
    (dropped) => dropped && tour.advance('diagram-dropped')
  )
}

export function watchTourTab(tour) {
  const tabs = useTabsStore()
  watch(
    () =>
      tour.running?.id !== 'core' &&
      !!tour.step?.onTab &&
      !!tour.tourTabId &&
      !tabs.tabs.some((t) => t.id === tour.tourTabId),
    (gone) => gone && tour.skip()
  )
}
