// Which catalogue entries each tour step renders. The WORDS live in
// src/shared/i18n/en.json under `tour.<id>` — edit wording there.
//
// Explicit keys rather than `tour.${step.id}.title`: a template literal is
// invisible to scripts/check-i18n.mjs, so a step whose copy was never written
// would render its own key id instead of failing the build.

/** @type {Record<string, { titleKey: string, bodyKey: string, nextLabelKey?: string }>} */
export const TOUR_COPY = {
  compare: {
    titleKey: 'tour.compare.title',
    bodyKey: 'tour.compare.body',
    nextLabelKey: 'tour.compare.nextLabel'
  },
  share: { titleKey: 'tour.share.title', bodyKey: 'tour.share.body' },
  library: { titleKey: 'tour.library.title', bodyKey: 'tour.library.body' },
  'quick-look': { titleKey: 'tour.quick-look.title', bodyKey: 'tour.quick-look.body' },
  'settings-open': {
    titleKey: 'tour.settings-open.title',
    bodyKey: 'tour.settings-open.body',
    nextLabelKey: 'tour.settings-open.nextLabel'
  },
  'settings-panes': { titleKey: 'tour.settings-panes.title', bodyKey: 'tour.settings-panes.body' },
  'settings-tips': { titleKey: 'tour.settings-tips.title', bodyKey: 'tour.settings-tips.body' },
  'snippet-new': {
    titleKey: 'tour.snippet-new.title',
    bodyKey: 'tour.snippet-new.body',
    nextLabelKey: 'tour.snippet-new.nextLabel'
  },
  'snippet-save': { titleKey: 'tour.snippet-save.title', bodyKey: 'tour.snippet-save.body' },
  'snippet-drag': { titleKey: 'tour.snippet-drag.title', bodyKey: 'tour.snippet-drag.body' },
  'diagram-open': {
    titleKey: 'tour.diagram-open.title',
    bodyKey: 'tour.diagram-open.body',
    nextLabelKey: 'tour.diagram-open.nextLabel'
  },
  diagram: { titleKey: 'tour.diagram.title', bodyKey: 'tour.diagram.body' }
}
