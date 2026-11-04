// Literal copy keys, so check:i18n sees them; `{example}` and `{v2}` stand for the Diagrams snippets.

/** What *Use a sample* puts in the Snippets tour's editor. */
export const SAMPLE_LINE = 'Deploying {{service}} to staging on {{today}}'

const CORE = {
  id: 'core',
  introducedIn: '0.16.0',
  nameKey: 'onboarding.core.name',
  summaryKey: 'onboarding.core.summary',
  hue: 'diff',
  icon: 'diff',
  labelKey: 'onboarding.tryIt',
  doneCard: {
    titleKey: 'onboarding.core.done.title',
    bodyKey: 'onboarding.core.done.more',
    footKey: 'onboarding.core.done.where',
    next: ['snippets', 'diagrams']
  },
  steps: [
    {
      id: 'drop',
      advanceOn: 'sample-opened',
      target: '[data-tour="sample-chips"]',
      inline: true,
      titleKey: 'onboarding.core.drop.title'
    },
    {
      id: 'save',
      advanceOn: 'sample-saved',
      target: '[data-tour="save"]',
      side: 'bottom',
      onTab: true,
      titleKey: 'onboarding.core.save.title',
      bodyKey: 'onboarding.core.save.body'
    },
    {
      id: 'find',
      advanceOn: 'sample-found',
      target: '[data-tour="search"]',
      side: 'right',
      titleKey: 'onboarding.core.find.title',
      bodyKey: 'onboarding.core.find.body'
    }
  ]
}

const SNIPPETS = {
  id: 'snippets',
  introducedIn: '0.16.0',
  nameKey: 'onboarding.snippets.name',
  summaryKey: 'onboarding.snippets.summary',
  hue: 'snippet',
  icon: 'code',
  labelKey: 'onboarding.snippets.label',
  steps: [
    {
      id: 'new',
      advanceOn: 'snippet-opened',
      target: '[data-tour="snippet-new"]',
      side: 'right',
      titleKey: 'onboarding.snippets.new.title',
      bodyKey: 'onboarding.snippets.new.body'
    },
    {
      id: 'blank',
      advanceOn: 'snippet-blank',
      target: '[data-tour="snippet-body"]',
      side: 'inside',
      ring: false,
      onTab: true,
      tokens: ['service', 'today'],
      actionKey: 'onboarding.snippets.blank.sample',
      titleKey: 'onboarding.snippets.blank.title',
      bodyKey: 'onboarding.snippets.blank.body'
    },
    {
      id: 'name-save',
      advanceOn: 'snippet-saved',
      target: '[data-tour="snippet-save"]',
      also: ['[data-tour="snippet-name"]'],
      side: 'bottom',
      onTab: true,
      titleKey: 'onboarding.snippets.save.title',
      bodyKey: 'onboarding.snippets.save.body'
    },
    {
      id: 'copy',
      advanceOn: 'snippet-filled',
      target: '[data-tour="snippet-copy"]',
      side: 'bottom',
      onTab: true,
      titleKey: 'onboarding.snippets.copy.title',
      bodyKey: 'onboarding.snippets.copy.body',
      alt: {
        target: '[data-tour="fill-dialog"]',
        side: 'right',
        titleKey: 'onboarding.snippets.fill.title',
        bodyKey: 'onboarding.snippets.fill.body'
      }
    }
  ]
}

const DIAGRAMS = {
  id: 'diagrams',
  introducedIn: '0.16.0',
  nameKey: 'onboarding.diagrams.name',
  summaryKey: 'onboarding.diagrams.summary',
  hue: 'inspect',
  icon: 'diagram',
  labelKey: 'onboarding.diagrams.label',
  doneCard: {
    titleKey: 'onboarding.diagrams.done.title',
    bodyKey: 'onboarding.diagrams.done.body'
  },
  steps: [
    {
      id: 'open',
      advanceOn: 'diagram-opened',
      target: '[data-snippet-id="{example}"]',
      side: 'right',
      titleKey: 'onboarding.diagrams.open.title',
      bodyKey: 'onboarding.diagrams.open.body'
    },
    {
      id: 'compare',
      advanceOn: 'diagram-compared',
      target: '[data-tour="snippet-compare"]',
      side: 'bottom',
      onTab: true,
      titleKey: 'onboarding.diagrams.compare.title',
      bodyKey: 'onboarding.diagrams.compare.body'
    },
    {
      id: 'drop',
      advanceOn: 'diagram-dropped',
      target: '[data-tour="pane-right"]',
      also: ['[data-snippet-id="{v2}"]'],
      zone: true,
      side: 'zone',
      onTab: true,
      nameKey: 'snippetNotices.exampleMermaidDiagramV2',
      titleKey: 'onboarding.diagrams.drop.title',
      bodyKey: 'onboarding.diagrams.drop.body'
    }
  ]
}

/** @type {import('../../types').Tour[]} */
export const TOURS = [CORE, SNIPPETS, DIAGRAMS]

/** @returns {import('../../types').Tour|null} */
export const tourById = (id) => TOURS.find((tour) => tour.id === id) ?? null
