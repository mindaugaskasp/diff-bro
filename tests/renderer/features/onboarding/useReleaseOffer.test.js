import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import { useOnboardingStore } from '../../../../src/renderer/src/features/onboarding'
import { useReleaseOffer } from '../../../../src/renderer/src/features/onboarding/useReleaseOffer'
import { useUiStore } from '../../../../src/renderer/src/stores/uiStore'

const release = (id, introducedIn) => ({
  id,
  introducedIn,
  release: true,
  nameKey: 'onboarding.snippets.name',
  labelKey: 'onboarding.snippets.label',
  steps: [{ id: 'one', advanceOn: 'fixture-one', target: '[data-tour="search"]' }]
})

function setup() {
  setActivePinia(createPinia())
  localStorage.clear()
  localStorage.setItem(
    'diffbro.onboarding',
    JSON.stringify({ schema: 2, offerTours: true, tours: {}, offer: false, version: '0.16.0' })
  )
  window.api = { appVersion: '0.17.0' }
  const tour = useOnboardingStore()
  tour.init()
  const scope = effectScope()
  const offer = scope.run(() => useReleaseOffer())
  return { tour, ui: useUiStore(), offer }
}

let ctx
beforeEach(() => (ctx = setup()))

describe('the release card', () => {
  it('shows a release tour the user has not seen', async () => {
    ctx.tour.registry.push(release('run', '0.17.0'))
    await nextTick()
    expect(ctx.offer.visible.value).toBe(true)
    expect(ctx.offer.single.value.id).toBe('run')
  })

  it('waits while a dialog is open, and shows once it closes', async () => {
    ctx.ui.noteDialog(true)
    ctx.tour.registry.push(release('run', '0.17.0'))
    await nextTick()
    expect(ctx.tour.releaseCard).toBeNull()
    ctx.ui.noteDialog(false)
    await nextTick()
    expect(ctx.offer.visible.value).toBe(true)
  })

  it('waits while a tour runs', async () => {
    ctx.tour.start('core')
    ctx.tour.registry.push(release('run', '0.17.0'))
    await nextTick()
    expect(ctx.offer.visible.value).toBe(false)
    ctx.tour.skip()
    await nextTick()
    expect(ctx.offer.visible.value).toBe(true)
  })

  it('hides behind a dialog opened over it, and comes back', async () => {
    ctx.tour.registry.push(release('run', '0.17.0'))
    await nextTick()
    ctx.ui.noteDialog(true)
    expect(ctx.offer.visible.value).toBe(false)
    ctx.ui.noteDialog(false)
    expect(ctx.offer.visible.value).toBe(true)
  })

  it('merges several tours into one card', async () => {
    ctx.tour.registry.push(release('run', '0.17.0'), release('share', '0.17.0'))
    await nextTick()
    expect(ctx.offer.single.value).toBeNull()
    expect(ctx.offer.cardTours.value.map((t) => t.id)).toEqual(['run', 'share'])
    expect(ctx.offer.version.value).toBe('0.17.0')
  })
})
