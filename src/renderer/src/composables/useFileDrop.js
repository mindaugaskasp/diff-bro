import { computed, ref } from 'vue'
import { DIFF_DRAG_TYPE, dragIdsFrom } from '../utils/snippetSource'
import { openSavedDiff } from './useSavedDiffOpen'
import { isSnippetDragType } from './useSnippetDrag'
import { useShareStore } from '../features/share'

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

const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
const snippetIds = (e) => dragIdsFrom(e.dataTransfer)
const diffIds = (e) => dragIdsFrom(e.dataTransfer, DIFF_DRAG_TYPE)
// Types only: the payload is unreadable until drop.
const isRowDrag = (e) =>
  isSnippetDragType(e.dataTransfer) ||
  Array.from(e.dataTransfer?.types ?? []).includes(DIFF_DRAG_TYPE)
const carries = (e) => hasFiles(e) || isRowDrag(e)
// A drop released over a file slot targets that side.
const sideUnder = (e) => e.target.closest?.('[data-side]')?.dataset.side ?? null
// A snippet BECOMES the comparison, so it has to be released on the thing it
// will be compared in. Bound to the window, this handler accepted one dropped
// anywhere — over the sidebar, over the toolbar, or from a drag that never
// really left the row — and silently replaced what was on screen. Files keep
// the window-wide target: dropping a file on the app is its own gesture.
const inDiffRegion = (e) => !!e.target?.closest?.('[data-drop-region="diff"]')

// A dropped key or sealed diff is not a comparison: each opens its own flow.
async function dropPaths(store, paths, targetSide) {
  const keyPath = paths.find((p) => p.toLowerCase().endsWith('.diffbrokey'))
  if (keyPath) return useShareStore().receiveDroppedKey(keyPath)
  const sharedPath = paths.find((p) => p.toLowerCase().endsWith('.diffbro'))
  if (sharedPath) return useShareStore().receiveDroppedSharedDiff(sharedPath)
  return store.dropFiles(paths, targetSide)
}

// What a release actually means, by payload. A dropped DIFF replaces the
// comparison wholesale; a dropped snippet fills one side; a file may be either.
// Both row flavours only count inside the column that will host them.
async function routeDrop(e, store) {
  const dropped = diffIds(e)
  if (dropped.length) {
    if (inDiffRegion(e)) await openSavedDiff(dropped[0])
    return
  }
  const ids = snippetIds(e)
  if (ids.length) {
    if (inDiffRegion(e)) await store.dropSnippets(ids, sideUnder(e))
    return
  }
  if (!hasFiles(e)) return
  const paths = Array.from(e.dataTransfer.files)
    .map((f) => window.api.getPathForFile(f))
    .filter(Boolean)
  if (paths.length) await dropPaths(store, paths, sideUnder(e))
}

// Window-level diff drop. A dragenter/leave depth counter avoids child-element
// flicker; `suppressed` stands it down while a dialog handles its own drops.
export function useWindowFileDrop(store, suppressed) {
  const depth = ref(0)
  const inWindow = ref(false)
  // Which flavour is in flight, so the overlay can say what will happen.
  const snippetDrag = ref(false)
  const overDiff = ref(false)
  // A file may land anywhere; a snippet only counts over the comparison column,
  // so the overlay must not promise "drop to compare" outside it.
  const active = computed(() => inWindow.value && (!snippetDrag.value || overDiff.value))

  // Never gate this: a snippet drag STARTS in the sidebar, so an enter skipped
  // there while dragleave still decremented unbalanced the counter.
  function onDragEnter(e) {
    if (!carries(e) || suppressed.value) return
    depth.value += 1
    inWindow.value = true
    snippetDrag.value = isRowDrag(e)
  }
  // Where the pointer IS belongs to dragover: it fires continuously with the
  // element actually under it, which dragenter does not.
  const onDragOver = (e) => {
    if (snippetDrag.value) overDiff.value = inDiffRegion(e)
  }
  function onDragLeave() {
    depth.value = Math.max(0, depth.value - 1)
    if (depth.value === 0) {
      inWindow.value = false
      snippetDrag.value = false
      overDiff.value = false
    }
  }
  async function onDrop(e) {
    depth.value = 0
    inWindow.value = false
    snippetDrag.value = false
    overDiff.value = false
    if (suppressed.value) return
    await routeDrop(e, store)
  }

  return { active, onDragEnter, onDragOver, onDragLeave, onDrop, snippetDrag }
}
