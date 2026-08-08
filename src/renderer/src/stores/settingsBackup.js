// What a configuration backup carries, and what a restore puts back. Its own
// module because the store is at its cap, and because this is one concern: the
// archive used to hold only the theme, so every limit, toggle, shortcut and
// ordering was lost on a new machine — silently, which is the worst way.
import { loadPersisted } from '../persist'
import { settingsStateFrom } from '../utils/settingsDefaults'

export const backupActions = {
  // The same shape persist() writes, so a key added there travels without
  // being remembered here.
  backupState() {
    return { ...JSON.parse(loadPersisted('settings') ?? '{}'), theme: this.userTheme }
  },
  restoreState(state) {
    if (!state || typeof state !== 'object') return
    Object.assign(
      this,
      settingsStateFrom(state, {
        showShortcutBar: state.showShortcutBar !== false,
        theme: state.theme
      })
    )
    this.persist()
    this.resolveActiveTheme()
  }
}
