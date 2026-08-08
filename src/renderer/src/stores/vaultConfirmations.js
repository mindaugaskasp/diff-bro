// The retag and delete confirmation flows, spread into vaultStore. Dialog
// bookkeeping rather than vault work, and the store they live in is at its cap.
export const confirmationActions = {
  requestRetag(id) {
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return
    this.pendingRetag = { id, name: entry.name, tags: [...(entry.tags || [])] }
  },
  cancelRetag() {
    this.pendingRetag = null
  },
  requestDelete(id, name) {
    this.pendingDelete = { id, name }
  },
  confirmDelete() {
    const pending = this.pendingDelete
    this.pendingDelete = null
    if (pending) this.remove(pending.id)
  },
  cancelDelete() {
    this.pendingDelete = null
  }
}
