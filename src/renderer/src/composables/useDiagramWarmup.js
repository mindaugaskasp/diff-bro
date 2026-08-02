import { watch } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { warmMermaid } from './useMermaid'

/**
 * Pull Mermaid's renderer in while the app is idle. It is a 2.8 MB chunk kept
 * out of the main bundle, so the first diagram of a session cost ~400ms of
 * stopped app — paid by whichever surface got there first, including a capture.
 *
 * Watched rather than checked once: on a first run the example snippet is seeded
 * AFTER mount, so a library that will hold a diagram does not look like one yet.
 */
export function useDiagramWarmup() {
  const snippets = useSnippetStore()
  let warmed = false
  watch(
    () => snippets.hasDiagrams,
    (has) => {
      if (!has || warmed) return
      warmed = true
      const idle = window.requestIdleCallback
      if (idle) idle(() => warmMermaid(), { timeout: 4000 })
      else setTimeout(warmMermaid, 1500)
    },
    { immediate: true }
  )
}
