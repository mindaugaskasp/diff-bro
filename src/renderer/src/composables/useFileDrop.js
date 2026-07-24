import { ref } from 'vue'

// Load a dropped file's text into a tool input. Reading goes through the main
// process (window.api.readFile); the drop path is registered with main via
// getPathForFile, so the file-read provenance allowlist permits it (see
// src/main/files.js). `apply(text, name)` receives the decoded content.
export function useFileTextDrop(apply) {
  async function onDropFile(e) {
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    const path = window.api.getPathForFile(file)
    if (!path) return
    const res = await window.api.readFile(path)
    // `path` is passed through as a third arg for callers that keep it (e.g.
    // partial-paste live reload); tool inputs simply ignore it.
    if (res && !res.error && res.content != null) apply(res.content, res.name, res.path)
  }
  return { onDropFile }
}

// Window-level diff drop: files dropped anywhere load into the two sides. A
// dragenter/dragleave counter avoids the flicker you'd get from child elements
// firing dragleave as the pointer moves over them, and `suppressed` stands the
// whole thing down while a dialog that handles its own drops is open —
// otherwise a drop on the dialog's backdrop would load a diff behind it.
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
    // A dropped public key opens the "name this trusted key" dialog instead of
    // loading a diff.
    const keyPath = paths.find((p) => p.toLowerCase().endsWith('.diffbrokey'))
    if (keyPath) {
      await store.receiveDroppedKey(keyPath)
      return
    }
    // A dropped sealed diff is imported as an external diff and opened, rather
    // than being mistaken for a file to compare. Checked after .diffbrokey so
    // the more specific extension wins (.diffbrokey also ends in "key", not
    // "diffbro", so order only matters for clarity here).
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
