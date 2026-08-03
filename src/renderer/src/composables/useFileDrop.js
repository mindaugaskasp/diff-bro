import { ref } from 'vue'
import { dragIdsFrom } from '../utils/snippetSource'
import { isSnippetDragType } from './useSnippetDrag'

// Load a dropped file's text into a tool input. getPathForFile registers the
// path with main's read allowlist (src/main/files.js).
export function useFileTextDrop(apply) {
  async function onDropFile(e) {
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    const path = window.api.getPathForFile(file)
    if (!path) return
    const res = await window.api.readFile(path)
    if (res && !res.error && res.content != null) apply(res.content, res.name, res.path)
  }
  return { onDropFile }
}

// Window-level diff drop. A dragenter/leave depth counter avoids child-element
// flicker; `suppressed` stands it down while a dialog handles its own drops.
export function useWindowFileDrop(store, suppressed) {
  const depth = ref(0)
  const active = ref(false)
  // Which flavour is in flight, so the overlay can say what will happen.
  const snippetDrag = ref(false)

  const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
  const snippetIds = (e) => dragIdsFrom(e.dataTransfer)
  // Types only: the payload is unreadable until drop.
  const carries = (e) => hasFiles(e) || isSnippetDragType(e.dataTransfer)
  // A drop released over a file slot targets that side.
  const sideUnder = (e) => e.target.closest?.('[data-side]')?.dataset.side ?? null

  function onDragEnter(e) {
    if (!carries(e) || suppressed.value) return
    depth.value += 1
    active.value = true
    snippetDrag.value = isSnippetDragType(e.dataTransfer)
  }
  function onDragLeave() {
    depth.value = Math.max(0, depth.value - 1)
    if (depth.value === 0) {
      active.value = false
      snippetDrag.value = false
    }
  }
  async function onDrop(e) {
    depth.value = 0
    active.value = false
    snippetDrag.value = false
    if (suppressed.value) return
    const ids = snippetIds(e)
    if (ids.length) {
      await store.dropSnippets(ids, sideUnder(e))
      return
    }
    if (!hasFiles(e)) return
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.api.getPathForFile(f))
      .filter(Boolean)
    if (paths.length) await dropPaths(paths, sideUnder(e))
  }

  // A dropped key or sealed diff is not a comparison: each opens its own flow.
  async function dropPaths(paths, targetSide) {
    const keyPath = paths.find((p) => p.toLowerCase().endsWith('.diffbrokey'))
    if (keyPath) return store.receiveDroppedKey(keyPath)
    const sharedPath = paths.find((p) => p.toLowerCase().endsWith('.diffbro'))
    if (sharedPath) return store.receiveDroppedSharedDiff(sharedPath)
    return store.dropFiles(paths, targetSide)
  }

  return { active, onDragEnter, onDragLeave, onDrop, snippetDrag }
}
