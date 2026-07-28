import { ref } from 'vue'

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

  const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  function onDragEnter(e) {
    if (!hasFiles(e) || suppressed.value) return
    depth.value += 1
    active.value = true
  }
  function onDragLeave() {
    depth.value = Math.max(0, depth.value - 1)
    if (depth.value === 0) active.value = false
  }
  async function onDrop(e) {
    depth.value = 0
    active.value = false
    if (!hasFiles(e) || suppressed.value) return
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.api.getPathForFile(f))
      .filter(Boolean)
    if (!paths.length) return
    // A dropped public key opens the naming dialog, not a diff.
    const keyPath = paths.find((p) => p.toLowerCase().endsWith('.diffbrokey'))
    if (keyPath) {
      await store.receiveDroppedKey(keyPath)
      return
    }
    // A dropped sealed diff imports + opens (checked after .diffbrokey).
    const sharedPath = paths.find((p) => p.toLowerCase().endsWith('.diffbro'))
    if (sharedPath) {
      await store.receiveDroppedSharedDiff(sharedPath)
      return
    }
    // If the drop landed on a specific file slot, target that side.
    const targetSide = e.target.closest?.('[data-side]')?.dataset.side ?? null
    await store.dropFiles(paths, targetSide)
  }

  return { active, onDragEnter, onDragLeave, onDrop }
}
