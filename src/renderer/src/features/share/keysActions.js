// Spread into shareStore, which is near its cap.
import { useSettingsStore } from '../../stores/settingsStore'

export const keysActions = {
  async refreshTrusted() {
    this.trusted = (await window.api.listTrustedKeys?.()) ?? []
  },
  openKeysPanel() {
    const settings = useSettingsStore()
    settings.setSidebarPanel('keys')
    settings.setSidebarCollapsed(false)
    this.refreshTrusted()
  }
}
