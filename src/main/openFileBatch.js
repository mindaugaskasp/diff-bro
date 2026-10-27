// Finder sends one `open-file` per file; ones within `windowMs` were opened together.
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
