import { computed, onBeforeUnmount, ref } from 'vue'
import { holdPersisted, releasePersisted } from '../persist'
import { activeLocale, setLocale as applyLocale } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'
import { useEditorFontStore } from '../stores/editorFontStore'
import { useUiStore } from '../stores/uiStore'
import { useOnboardingStore } from '../features/onboarding'
import { useEmailStore } from '../features/email'

// Every key a Settings control writes. Operations that act outside the app
// (moving the data folder, installing the CLI, start at login) are not drafts.
export const DRAFTED_KEYS = ['settings', 'theme', 'editorFont', 'onboarding', 'email']

// Only what the dialog edits: the same blob also carries state the app changes
// on its own (examples seeded, recent tools), which a discard must not roll back.
export const DRAFTED_SETTINGS = [
  'userTheme',
  'rotateThemeDaily',
  'locale',
  'maximizeDialogs',
  'showRowTags',
  'showShortcutBar',
  'shutterSound',
  'fileSizeLimitsMb',
  'maxExportHeightPx',
  'maxSnippetSizeKb',
  'closeToTray',
  'autoCloseOldest',
  'restoreSession',
  'autoBackup',
  'autoBackupHours',
  'quickLookShortcut'
]

const pick = (state, keys) => Object.fromEntries(keys.map((k) => [k, state[k]]))

function draftStores() {
  return {
    settings: useSettingsStore(),
    font: useEditorFontStore(),
    ui: useUiStore(),
    tour: useOnboardingStore(),
    email: useEmailStore()
  }
}

const readDraft = (s) =>
  JSON.stringify({
    settings: pick(s.settings.$state, DRAFTED_SETTINGS),
    font: s.font.$state,
    email: s.email.$state,
    showTips: s.tour.showTips,
    zoom: s.ui.diffZoom
  })

// Puts every drafted value back, re-applies what is visible at once (theme,
// language), then rewrites the blobs so state outside the draft is not lost.
function restoreDraft(s, start, locale) {
  const was = JSON.parse(start)
  s.settings.$patch(was.settings)
  s.font.$patch(was.font)
  s.email.$patch(was.email)
  s.tour.showTips = was.showTips
  s.ui.diffZoom = was.zoom
  s.settings.resolveActiveTheme()
  if (activeLocale() !== locale) {
    applyLocale(locale)
    window.api?.setLocale?.(locale)
  }
  releasePersisted(false)
  s.settings.persist()
  s.tour.persist()
}

/**
 * Settings edits apply live, so the reader sees them, but reach disk only on
 * Save; closing with unsaved edits asks first.
 * @param {{ close: () => void }} opts
 */
export function useSettingsDraft({ close }) {
  const stores = draftStores()
  const draft = { start: '', locale: '', open: false, after: null }
  const asking = ref(false)
  const generation = ref(0)

  function begin() {
    Object.assign(draft, { start: readDraft(stores), locale: activeLocale(), open: true })
    generation.value++
    holdPersisted(DRAFTED_KEYS)
  }
  function finish(commit) {
    if (!draft.open) return
    draft.open = false
    if (commit) releasePersisted(true)
    else restoreDraft(stores, draft.start, draft.locale)
  }
  function leave() {
    asking.value = false
    close()
    draft.after?.()
    draft.after = null
  }

  const isDirty = computed(() => generation.value > 0 && readDraft(stores) !== draft.start)

  function requestClose(after = null) {
    if (asking.value) return
    draft.after = after
    if (isDirty.value) asking.value = true
    else {
      finish(false)
      leave()
    }
  }
  /** @param {'save' | 'discard' | 'keep'} choice */
  function answer(choice) {
    if (choice === 'keep') {
      asking.value = false
      draft.after = null
      return
    }
    finish(choice === 'save')
    leave()
  }
  function save() {
    finish(true)
    begin()
  }

  begin()
  onBeforeUnmount(() => finish(false))
  return { isDirty, asking, save, requestClose, answer }
}
