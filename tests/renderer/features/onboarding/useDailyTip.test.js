import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import { useOnboardingStore } from '../../../../src/renderer/src/features/onboarding'
import { useDailyTip } from '../../../../src/renderer/src/features/onboarding/useDailyTip'
import { useTipShowMe } from '../../../../src/renderer/src/features/onboarding/useTipShowMe'
import { localDay } from '../../../../src/renderer/src/features/onboarding/tipSchedule'
import { useSettingsStore } from '../../../../src/renderer/src/stores/settingsStore'
import { useSnippetStore } from '../../../../src/renderer/src/stores/snippetStore'
import { useUiStore } from '../../../../src/renderer/src/stores/uiStore'

const EXISTING = { schema: 2, offerTours: true, tours: {}, offer: false, version: '0.16.0' }
const stored = () => JSON.parse(localStorage.getItem('diffbro.onboarding') ?? 'null')

let scope
let day
function setup(onboarding = EXISTING, { focused = false } = {}) {
  setActivePinia(createPinia())
  localStorage.clear()
  if (onboarding) localStorage.setItem('diffbro.onboarding', JSON.stringify(onboarding))
  window.api = { appVersion: '0.16.0' }
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused)
  const tour = useOnboardingStore()
  tour.init()
  day = '2026-11-04'
  tour.today = () => day
  scope = effectScope()
  const tip = scope.run(() => useDailyTip())
  return { tour, ui: useUiStore(), tip }
}

const focus = async () => {
  window.dispatchEvent(new Event('focus'))
  await nextTick()
}

let ctx
beforeEach(() => (ctx = setup()))
afterEach(() => {
  scope.stop()
  vi.restoreAllMocks()
})

describe('when a tip shows', () => {
  it('shows the first tip on the first focus of a new date', async () => {
    expect(ctx.tour.tipCard).toBeNull()
    await focus()
    expect(ctx.tour.tipCard).toBe('hash-scope-search')
    expect(ctx.tip.visible.value).toBe(true)
  })

  it('shows on launch when the window already has focus', async () => {
    const { tour } = setup(EXISTING, { focused: true })
    await nextTick()
    expect(tour.tipCard).toBe('hash-scope-search')
  })

  it('shows when the window becomes visible', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(ctx.tour.tipCard).toBe('hash-scope-search')
  })

  it('shows none on a second focus the same day', async () => {
    await focus()
    ctx.tour.closeTip()
    await focus()
    expect(ctx.tour.tipCard).toBeNull()
  })

  it('shows the next tip the next day', async () => {
    await focus()
    ctx.tour.closeTip()
    day = '2026-11-05'
    await focus()
    expect(ctx.tour.tipCard).toBe('snippet-colour')
  })

  it('remembers the day across a relaunch', async () => {
    await focus()
    const { tour } = setup(stored())
    await focus()
    expect(tour.tipCard).toBeNull()
  })
})

describe('what it waits for', () => {
  it('waits for a dialog to close', async () => {
    ctx.ui.noteDialog(true)
    await focus()
    expect(ctx.tour.tipCard).toBeNull()
    ctx.ui.noteDialog(false)
    await nextTick()
    expect(ctx.tour.tipCard).toBe('hash-scope-search')
  })

  it('waits for a running tour', async () => {
    ctx.tour.start('snippets')
    await focus()
    expect(ctx.tour.tipCard).toBeNull()
    ctx.tour.skip()
    await nextTick()
    expect(ctx.tour.tipCard).toBe('hash-scope-search')
  })

  it('waits for a done card', async () => {
    ctx.tour.doneCard = 'core'
    await focus()
    expect(ctx.tour.tipCard).toBeNull()
    ctx.tour.dismissDone()
    await nextTick()
    expect(ctx.tour.tipCard).toBe('hash-scope-search')
  })

  it('lets a pending release card go first, then shows', async () => {
    ctx.tour.registry.push({ id: 'run', introducedIn: '0.16.0', release: true, steps: [] })
    ctx.tour.version = '0.15.0'
    await focus()
    expect(ctx.tour.tipCard).toBeNull()
    ctx.tour.releaseCard = ['run']
    ctx.tour.version = '0.16.0'
    await nextTick()
    expect(ctx.tour.tipCard).toBeNull()
    ctx.tour.laterReleases()
    await nextTick()
    expect(ctx.tour.tipCard).toBe('hash-scope-search')
  })

  it('hides under a dialog opened over it, and comes back', async () => {
    await focus()
    ctx.ui.noteDialog(true)
    expect(ctx.tip.visible.value).toBe(false)
    ctx.ui.noteDialog(false)
    expect(ctx.tip.visible.value).toBe(true)
  })

  it('shows nothing on a fresh install’s first day before the core tour ends', async () => {
    const { tour } = setup(null)
    expect(tour.tips.since).toBe(localDay(new Date()))
    day = tour.tips.since
    await focus()
    expect(tour.isOffering).toBe(true)
    expect(tour.tipCard).toBeNull()
    tour.skip()
    await nextTick()
    expect(tour.tipCard).toBe('hash-scope-search')
  })

  it('does not wait for the offer once the install day is past', async () => {
    const { tour } = setup(null)
    day = '2026-11-05'
    tour.tips.since = '2026-11-04'
    await focus()
    expect(tour.isOffering).toBe(true)
    expect(tour.tipCard).toBe('hash-scope-search')
  })
})

describe('the card’s actions', () => {
  it('× closes it until tomorrow', async () => {
    await focus()
    ctx.tour.closeTip()
    expect(ctx.tip.visible.value).toBe(false)
    expect(stored().tips).toMatchObject({ shownOn: '2026-11-04', seen: ['hash-scope-search'] })
  })

  it('Knew this already removes the tip for good', async () => {
    await focus()
    ctx.tour.knowTip()
    expect(ctx.tour.tipCard).toBeNull()
    expect(stored().tips.known).toEqual(['hash-scope-search'])
    expect(ctx.tour.tipQueue[0]).toBe('snippet-colour')
  })

  it('Don’t show tips again turns tips off', async () => {
    await focus()
    ctx.tour.setShowTips(false)
    expect(ctx.tour.tipCard).toBeNull()
    day = '2026-11-05'
    await focus()
    expect(ctx.tour.tipCard).toBeNull()
    expect(stored().tips.on).toBe(false)
  })

  it('Bring back returns the known tips to the front of the order', async () => {
    await focus()
    ctx.tour.knowTip()
    ctx.tour.bringBackTips()
    expect(stored().tips.known).toEqual([])
    day = '2026-11-05'
    await focus()
    expect(ctx.tour.tipCard).toBe('hash-scope-search')
  })

  it('shows nothing once every tip has been seen or known', async () => {
    for (const [i, id] of ctx.tour.tipRegistry.map((t) => t.id).entries()) {
      day = `2026-12-0${i + 1}`
      await focus()
      expect(ctx.tour.tipCard).toBe(id)
      ctx.tour.closeTip()
    }
    day = '2026-12-09'
    await focus()
    expect(ctx.tour.tipCard).toBeNull()
  })

  it('Show me opens what the tip needs, rings it, and any click ends it', async () => {
    const box = { x: 10, y: 20, w: 200, h: 30 }
    const measure = vi.fn(() => box)
    const showMe = scope.run(() => useTipShowMe({ measure }))
    const settings = useSettingsStore()
    settings.setSidebarCollapsed(true)
    settings.setSidebarPanel('tools')
    await focus()
    await ctx.tour.showTip()
    expect(ctx.tour.tipCard).toBeNull()
    expect(ctx.tour.tipShowMe).toBe('hash-scope-search')
    expect(settings.sidebarCollapsed).toBe(false)
    expect(settings.sidebarPanel).toBe('snippets')
    await nextTick()
    expect(measure).toHaveBeenCalledWith('[data-tour="search"]')
    expect(showMe.rect.value).toEqual(box)
    expect(showMe.visible.value).toBe(true)
    window.dispatchEvent(new Event('pointerdown'))
    await nextTick()
    expect(ctx.tour.tipShowMe).toBeNull()
    expect(showMe.visible.value).toBe(false)
  })

  it('offers Show me only while its control can be shown', async () => {
    let box = null
    const showMe = scope.run(() => useTipShowMe({ measure: () => box }))
    ctx.tour.tipCard = 'mermaid-repair'
    await nextTick()
    expect(showMe.canShow.value).toBe(false)
    box = { x: 1, y: 1, w: 20, h: 20 }
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await nextTick()
    expect(showMe.canShow.value).toBe(true)
    ctx.tour.tipCard = 'quick-look-tools'
    await nextTick()
    expect(showMe.canShow.value).toBe(false)
  })

  it('offers Show me on a snippet row only when there is a snippet', async () => {
    const showMe = scope.run(() => useTipShowMe({ measure: () => null }))
    ctx.tour.tipCard = 'snippet-colour'
    await nextTick()
    expect(showMe.canShow.value).toBe(false)
    useSnippetStore().entries.push({ id: 's1', name: 'One', content: 'x' })
    expect(showMe.canShow.value).toBe(true)
  })
})
