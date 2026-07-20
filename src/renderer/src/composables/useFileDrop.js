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
    if (res && !res.error && res.content != null) apply(res.content, res.name)
  }
  return { onDropFile }
}
