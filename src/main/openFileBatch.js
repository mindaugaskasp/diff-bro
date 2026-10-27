// Finder sends one `open-file` per selected file, back to back. Files that
// arrive within `windowMs` of each other were opened together.
/**
 * @param {(paths: string[]) => void} deliver
 * @param {number} windowMs
 * @returns {(path: string) => void}
 */
export function batchOpenFiles(deliver, windowMs) {
  let pending = []
  let timer = null
  return (path) => {
    pending.push(path)
    clearTimeout(timer)
    timer = setTimeout(() => {
      const batch = pending
      pending = []
      deliver(batch)
    }, windowMs)
  }
}
