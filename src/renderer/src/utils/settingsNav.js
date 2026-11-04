// Literal keys, so check:i18n can see the call sites.
const GROUPS = [
  {
    id: 'general',
    labelKey: 'settingsDialog.group.general',
    pages: [
      { id: 'appearance', labelKey: 'settingsDialog.tab.appearance' },
      { id: 'behaviour', labelKey: 'settingsDialog.tab.behaviour' },
      { id: 'tours', labelKey: 'settingsDialog.tab.tours' },
      { id: 'shortcuts', labelKey: 'settingsDialog.tab.shortcuts' },
      { id: 'desktop', labelKey: 'settingsDialog.tab.desktop', windowsOnly: true }
    ]
  },
  {
    id: 'integrations',
    labelKey: 'settingsDialog.group.integrations',
    pages: [
      { id: 'languages', labelKey: 'settingsDialog.tab.languages' },
      { id: 'claude', labelKey: 'settingsDialog.tab.claude' },
      { id: 'cli', labelKey: 'settingsDialog.tab.cli' },
      { id: 'email', labelKey: 'settingsDialog.tab.email' }
    ]
  },
  {
    id: 'data',
    labelKey: 'settingsDialog.group.data',
    pages: [
      { id: 'storage', labelKey: 'settingsDialog.tab.storage' },
      { id: 'limits', labelKey: 'settingsDialog.tab.limits' },
      { id: 'logs', labelKey: 'settingsDialog.tab.logs' }
    ]
  }
]

/** @returns {import('../types').SettingsGroup[]} */
export function settingsGroups({ windows }) {
  return GROUPS.map((group) => ({
    ...group,
    pages: group.pages.filter((page) => windows || !page.windowsOnly)
  }))
}

export function groupOfPage(groups, pageId) {
  return groups.find((g) => g.pages.some((p) => p.id === pageId))?.id ?? null
}

/** @returns {import('../types').SettingsNavState} */
export function navForPage(groups, pageId) {
  const open = groupOfPage(groups, pageId)
  if (open) return { page: pageId, open }
  return { page: groups[0].pages[0].id, open: groups[0].id }
}

/** @returns {import('../types').SettingsNavState} */
export function navAfterGroupClick(groups, state, groupId) {
  const group = groups.find((g) => g.id === groupId)
  if (!group) return state
  if (state.open === groupId) return { ...state, open: null }
  if (groupOfPage(groups, state.page) === groupId) return { ...state, open: groupId }
  return { page: group.pages[0].id, open: groupId }
}
