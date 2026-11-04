import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '../../../../src/renderer/src/i18n'
import { useRunnerStore } from '../../../../src/renderer/src/features/runner/runnerStore'
import LanguageRow from '../../../../src/renderer/src/features/runner/components/LanguageRow.vue'

const PYTHON = {
  enabled: true,
  path: '/usr/bin/python3',
  version: '3.11.2',
  stopAfterMinutes: 2,
  candidates: [
    { path: '/opt/homebrew/bin/python3', version: '3.13.0' },
    { path: '/usr/bin/python3', version: '3.11.2' }
  ]
}
const PHP_OFF = { enabled: false, path: null, version: null, stopAfterMinutes: 2, candidates: [] }
const LANGUAGES = {
  python: { id: 'python', labelKey: 'language.python' },
  php: { id: 'php', labelKey: 'language.php' }
}

let app
let el
let runner

async function mountRow(id, status) {
  const pinia = createPinia()
  setActivePinia(pinia)
  runner = useRunnerStore()
  runner.status = { python: PYTHON, php: PHP_OFF, ...status }
  app = createApp({ render: () => h(LanguageRow, { language: LANGUAGES[id] }) })
  app.use(pinia).use(i18n)
  el = document.createElement('div')
  document.body.append(el)
  app.mount(el)
  await nextTick()
  return el
}

const field = () => el.querySelector('input.lang-path')
const button = (name) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === name)
const chevron = () => el.querySelector('.lang-chevron')
const menuRows = () => [...el.querySelectorAll('[role="menu"] .popover-row')]

beforeEach(() => {
  window.api = {
    runUsePath: vi.fn(async () => ({ ok: true, status: { python: PYTHON, php: PHP_OFF } })),
    runChoose: vi.fn(async () => ({ ok: true, status: { python: PYTHON, php: PHP_OFF } })),
    runFindAgain: vi.fn(async () => ({ ok: true, status: { python: PYTHON, php: PHP_OFF } })),
    runChange: vi.fn(async () => ({ canceled: true })),
    runSetStopAfter: vi.fn(async () => ({ ok: true, status: { python: PYTHON, php: PHP_OFF } }))
  }
})
afterEach(() => {
  app.unmount()
  el.remove()
})

describe('LanguageRow, inline', () => {
  it('shows the program path in a field, with its version, and no Off or Change…', async () => {
    await mountRow('python')
    expect(field().value).toBe('/usr/bin/python3')
    expect(el.querySelector('.lang-version').textContent).toBe('3.11.2')
    expect(el.textContent).not.toContain('Change…')
    expect(el.textContent).not.toMatch(/\bOff\b/)
    expect(button('Browse…')).toBeTruthy()
  })

  it('sends a typed path to main on Enter', async () => {
    await mountRow('python')
    field().value = '/usr/local/bin/python3'
    field().dispatchEvent(new Event('input'))
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(window.api.runUsePath).toHaveBeenCalledWith('python', '/usr/local/bin/python3')
  })

  it('sends nothing on Enter when the field still holds the program in use', async () => {
    await mountRow('python')
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(window.api.runUsePath).not.toHaveBeenCalled()
  })

  it('lists what was found under the chevron, the one in use marked, then Find again', async () => {
    await mountRow('python')
    chevron().click()
    await nextTick()
    const rows = menuRows()
    expect(rows.map((r) => r.textContent.trim())).toEqual([
      '3.13.0/opt/homebrew/bin/python3',
      '3.11.2/usr/bin/python3',
      'Find again'
    ])
    expect(rows[1].getAttribute('aria-checked')).toBe('true')
    expect(rows[0].getAttribute('aria-checked')).toBe('false')
  })

  it('picks a found program by its index', async () => {
    await mountRow('python')
    chevron().click()
    await nextTick()
    menuRows()[0].click()
    expect(window.api.runChoose).toHaveBeenCalledWith('python', 0)
  })

  it('offers Find again only while the language is on', async () => {
    await mountRow('python', { python: { ...PYTHON, enabled: false } })
    chevron().click()
    await nextTick()
    expect(menuRows().map((r) => r.textContent.trim())).not.toContain('Find again')
  })

  it('greys the field and Browse… while off, and says when it will find one', async () => {
    await mountRow('php')
    expect(el.querySelector('.lang-row').classList).toContain('is-off')
    expect(field().value).toBe('')
    expect(field().placeholder).toBe('Found when you turn it on')
    expect(field().disabled).toBe(false)
    expect(button('Browse…').disabled).toBe(false)
    expect(chevron()).toBeNull()
  })

  it('keeps the remembered path visible while off', async () => {
    await mountRow('php', { php: { ...PHP_OFF, path: '/bin/php', version: '8.3.6' } })
    expect(field().value).toBe('/bin/php')
    expect(el.querySelector('.lang-row').classList).toContain('is-off')
  })

  it('Browse… opens main’s own dialog', async () => {
    await mountRow('php')
    button('Browse…').click()
    expect(window.api.runChange).toHaveBeenCalledWith('php')
  })
})

describe('LanguageRow, stop after', () => {
  const minutes = () => el.querySelector('input.lang-minutes')

  it('shows the minutes main holds', async () => {
    await mountRow('python', { python: { ...PYTHON, stopAfterMinutes: 5 } })
    expect(minutes().value).toBe('5')
    expect(minutes().closest('label').textContent).toMatch(/Stop after\s*min/)
  })

  it('sends a whole number of minutes to main', async () => {
    await mountRow('python')
    minutes().value = '0'
    minutes().dispatchEvent(new Event('change'))
    expect(window.api.runSetStopAfter).toHaveBeenCalledWith('python', 0)
  })

  it('puts back what main holds instead of sending anything else', async () => {
    await mountRow('python')
    minutes().value = '-3'
    minutes().dispatchEvent(new Event('change'))
    expect(window.api.runSetStopAfter).not.toHaveBeenCalled()
    expect(minutes().value).toBe('2')
  })
})
