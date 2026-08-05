// When the tour is allowed to start. The gate is a race, not a preference:
// starting on mount raced restoreSession(), which overwrote the comparison the
// first step had just loaded.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useTourCommands } from '../../../src/renderer/src/composables/useTourCommands'
import { useOnboardingStore } from '../../../src/renderer/src/features/onboarding'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'
import { useCommands } from '../../../src/renderer/src/composables/useCommands'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = { storeSave: () => {} }
})

// The veil takes every click inside the window, but the OS menu sits outside it
// — and opening Settings from there put a dialog under the tour that was
// pointing somewhere else entirely.
describe('menus while the tour is running', () => {
  it('ignores a menu action, and takes it again once the tour ends', () => {
    const ui = useUiStore()
    const tour = useOnboardingStore()
    const { runFromMenu } = useCommands()

    tour.begin()
    expect(tour.active).toBe(true)
    runFromMenu('settings')
    expect(ui.showSettingsDialog).toBe(false)

    tour.skip()
    runFromMenu('settings')
    expect(ui.showSettingsDialog).toBe(true)
  })

  // The tour drives the same registry to open what a step points into; only the
  // menu path is gated.
  it("leaves the tour's own dispatch alone", () => {
    const ui = useUiStore()
    const tour = useOnboardingStore()
    const { run } = useCommands()

    tour.begin()
    run('settings')
    expect(ui.showSettingsDialog).toBe(true)
  })
})

describe('useTourCommands', () => {
  it('holds off until the restored session is in place', async () => {
    const tour = useOnboardingStore()
    const tabs = useTabsStore()
    useTourCommands()
    expect(tour.active).toBe(false)

    tabs.sessionReady = true
    await nextTick()
    expect(tour.active).toBe(true)
  })

  // `sessionReady` never turns true when the setting is off, because there is no
  // session to wait for. Gating on it alone meant the tour never ran at all —
  // silently, on every launch.
  it('starts straight away when no session will be restored', () => {
    useSettingsStore().setRestoreSession(false)
    const tour = useOnboardingStore()
    useTourCommands()
    expect(tour.active).toBe(true)
  })
})
