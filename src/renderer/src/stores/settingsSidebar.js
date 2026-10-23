// Beside the store because the store is at its size cap.
import { sanitizeSidebarPanel } from '../utils/settingsDefaults'

export const sidebarActions = {
  setSidebarCollapsed(value) {
    this.sidebarCollapsed = value === true
    this.persist()
  },
  setSidebarPanel(id) {
    if (sanitizeSidebarPanel(id) !== id) return
    this.sidebarPanel = id
    this.persist()
  }
}
