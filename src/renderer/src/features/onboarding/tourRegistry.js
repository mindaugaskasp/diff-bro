// Tours as data. A step waits for `advanceOn`, rings `target`, and names its
// copy by literal keys so check-i18n can see them.

/** @type {import('../../types').Tour[]} */
export const TOURS = [
  {
    id: 'core',
    introducedIn: '0.16.0',
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
        onSample: true,
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
]

/** @returns {import('../../types').Tour|null} */
export const tourById = (id) => TOURS.find((tour) => tour.id === id) ?? null
