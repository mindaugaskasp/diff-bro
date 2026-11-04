// Shown in this order; a release's own tips (`release`, `introducedIn`) go first while it runs.

/** @type {import('../../types').Tip[]} */
export const TIPS = [
  {
    id: 'hash-scope-search',
    titleKey: 'tips.hashScope.title',
    bodyKey: 'tips.hashScope.body',
    show: { target: '[data-tour="search"]', prepare: 'search', noteKey: 'tips.hashScope.note' }
  },
  {
    id: 'snippet-colour',
    titleKey: 'tips.snippetColour.title',
    bodyKey: 'tips.snippetColour.body',
    show: {
      target: '.snippets-section [data-snippet-id]',
      prepare: 'snippets',
      side: 'right',
      noteKey: 'tips.snippetColour.note'
    }
  },
  {
    id: 'name-placeholders',
    titleKey: 'tips.namePlaceholders.title',
    bodyKey: 'tips.namePlaceholders.body',
    tokens: ['today', 'now', 'week', 'weekday'],
    show: {
      target: '[data-tour="template-tags"]',
      side: 'top',
      noteKey: 'tips.namePlaceholders.note'
    }
  },
  {
    id: 'quick-look-tools',
    titleKey: 'tips.quickLookTools.title',
    bodyKey: 'tips.quickLookTools.body'
  },
  {
    id: 'mermaid-repair',
    titleKey: 'tips.mermaidRepair.title',
    bodyKey: 'tips.mermaidRepair.body',
    show: { target: '[data-tour="snippet-repair"]', noteKey: 'tips.mermaidRepair.note' }
  }
]
