import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { test, launchApp, freshUserDataDir, firstReadyPage } from '../../e2e/fixtures.mjs'
import { SNIPPETS } from '../../scripts/lib/seedData.mjs'

// #262: adding nearby people from the Share dialog. Real components opened through their stores;
// only the new parts are patched in, by cloning real elements so they keep the shipped styles.
const OUT = 'design/render/out/262'

const fp = () => randomBytes(16).toString('hex')
const BASE_PEOPLE = [
  { label: 'Ana Petrauskė', email: 'ana@acme.lt', online: true },
  { label: 'QA team', email: 'qa@acme.lt', online: true },
  { label: 'Rūta Vaitkutė', email: 'ruta@acme.lt', online: true },
  { label: 'Jonas Kazlauskas', online: false },
  { label: 'Marius Jankus', email: 'marius@acme.lt', online: false }
].map((p) => ({ ...p, fingerprint: fp() }))
const BASE_NEARBY = [
  { name: 'Ben Okafor', fp: fp() },
  { name: 'DESKTOP-NHBCR5M', fp: fp() },
  { name: 'Chen Liu', fp: fp(), old: true }
]

// Each state starts from its own copy: adding someone moves them from nearby to your people.
let PEOPLE = []
let NEARBY = []

const piniaStore = (id) =>
  `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('${id}')`

async function setStore(page, id, patch) {
  await page.evaluate(
    ({ expr, patch }) => {
      // eslint-disable-next-line no-new-func -- render script only, runs in the page
      const store = new Function(`return ${expr}`)()
      Object.assign(store, typeof patch === 'function' ? patch(store) : patch)
    },
    { expr: piniaStore(id), patch }
  )
  await page.waitForTimeout(250)
}

async function seed(dir) {
  writeFileSync(
    join(dir, 'trusted-keys.json'),
    JSON.stringify(
      PEOPLE.map(({ label, email, fingerprint }) => ({
        fingerprint,
        label,
        sign: 'c2lnbg==',
        box: 'Ym94',
        ...(email ? { email } : {})
      }))
    )
  )
}

async function seedSnippets(page) {
  await page.evaluate(async (snippets) => {
    const entries = []
    let t = Date.now()
    for (const s of snippets.slice(0, 8)) {
      const id = crypto.randomUUID()
      const aadSalt = crypto.randomUUID()
      const createdAt = t
      t -= 3 * 3600_000
      const box = await window.api.vaultEncrypt(s.content, [id, aadSalt, createdAt].join('|'))
      entries.push({
        id,
        aadSalt,
        name: s.name,
        createdAt,
        updatedAt: createdAt,
        language: s.language,
        detected: s.language,
        tags: [],
        iv: box.iv,
        tag: box.tag,
        data: box.data
      })
    }
    await window.api.storeSave('snippets', JSON.stringify({ tags: {}, entries }))
    await window.api.storeSave(
      'onboarding',
      JSON.stringify({ schema: 2, offerTours: true, tours: {}, offer: false, tips: { on: false } })
    )
  }, SNIPPETS)
}

const online = () =>
  PEOPLE.filter((p) => p.online).map((p) => ({ fp: p.fingerprint, name: p.label, trusted: true }))

async function lanOn(page) {
  await setStore(page, 'lan', {
    loaded: true,
    enabled: true,
    visible: true,
    online: true,
    peers: [...online(), ...NEARBY.map((n) => ({ fp: n.fp, name: n.name, trusted: false }))]
  })
}

async function openShare(page) {
  await lanOn(page)
  await setStore(page, 'share', {
    shareDraft: {
      name: 'nginx.conf ↔ nginx.prod.conf',
      ttlHours: 24,
      tags: [],
      snapshot: { mode: 'paste', pasteLeft: 'a', pasteRight: 'b' }
    }
  })
  await page.locator('.dialog .recipients').waitFor()
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const ana = [...document.querySelectorAll('.dialog .recipient')].find((r) =>
      r.textContent.includes('Ana Petrauskė')
    )
    ana?.querySelector('input')?.click()
  })
}

// Option A: Nearby under your people, built from the picker's own label and rows.
async function addNearbyGroup(page, { only = false } = {}) {
  await page.evaluate(
    ({ nearby, only }) => {
      const list = document.querySelector('.dialog .recipients')
      const label = document.querySelector('.dialog .field-label')
      const sample = list.querySelector('li')
      const addBtn = document.querySelector('.dialog .dialog-actions .btn-sm')
      if (only) {
        list.querySelectorAll('li').forEach((li) => li.remove())
        document.querySelector('.dialog .filterbar')?.remove()
        document.querySelector('.dialog .picked')?.remove()
        document.querySelector('.dialog .listfoot')?.remove()
      }
      const head = label.cloneNode(false)
      head.setAttribute('data-design-mock', '')
      head.textContent = 'Nearby'
      head.style.marginTop = only ? '0' : 'var(--space-2)'
      const group = list.cloneNode(false)
      group.setAttribute('data-design-mock', '')
      const nearbyRow = (n) => {
        const li = sample.cloneNode(true)
        const row = li.querySelector('label')
        row.classList.remove('active')
        row.classList.toggle('off', !!n.old)
        row.querySelector('input')?.remove()
        row.querySelector('.rc-name').textContent = n.name
        row.querySelector('.rc-mail')?.remove()
        const net = row.querySelector('.rc-net')
        net.textContent = 'Needs update'
        net.classList.remove('on')
        if (!n.old) net.remove()
        const btn = addBtn.cloneNode(false)
        btn.textContent = 'Add'
        btn.disabled = !!n.old
        row.appendChild(btn)
        return li
      }
      for (const n of nearby) group.appendChild(nearbyRow(n))
      list.after(head)
      head.after(group)
      const scroller = document.querySelector('.dialog .rows')
      scroller.scrollTop = scroller.scrollHeight
    },
    { nearby: NEARBY, only }
  )
  await page.waitForTimeout(150)
}

// Option B: one plain button under the list.
async function addNearbyButton(page) {
  await page.evaluate((n) => {
    const scroller = document.querySelector('.dialog .rows')
    const addBtn = document.querySelector('.dialog .dialog-actions .btn-sm')
    const btn = addBtn.cloneNode(false)
    btn.setAttribute('data-design-mock', '')
    btn.disabled = false
    btn.textContent = `Add someone nearby · ${n}`
    btn.style.alignSelf = 'flex-start'
    btn.style.marginTop = 'var(--space-2)'
    scroller.after(btn)
  }, NEARBY.length)
}

async function showCode(page, { name, code, title, note, actions }) {
  await setStore(page, 'lan', {
    pairing: {
      id: 'x',
      role: 'holder',
      stage: 'show-code',
      fp: NEARBY[0].fp,
      name,
      code,
      expiresAt: Date.now() + 98_000
    }
  })
  await page.locator('.dialog .code-box').waitFor()
  if (!title) return
  await page.evaluate(
    ({ title, note, code, actions }) => {
      const dlg = [...document.querySelectorAll('.dialog')].at(-1)
      dlg.querySelector('.dialog-header h3').textContent = title
      dlg.querySelector('.show-code > .dialog-note').textContent = note
      const box = dlg.querySelector('.code-box')
      box.querySelector('.code').textContent = code
      box.querySelector('.hint')?.remove()
      box.style.cursor = 'default'
      const row = dlg.querySelector('.dialog-actions')
      const cancel = row.querySelector('.btn-ghost')
      cancel.textContent = actions[0]
      if (actions[1]) {
        const primary = cancel.cloneNode(false)
        primary.className = cancel.className.replace('btn-ghost', 'btn-primary')
        primary.textContent = actions[1]
        row.appendChild(primary)
      }
    },
    { title, note, code, actions }
  )
}

async function adderResult(page, stage, patch) {
  await setStore(page, 'lan', {
    pairing: { id: 'x', role: 'adder', stage, fp: NEARBY[0].fp, name: 'Ben Okafor' }
  })
  await page.locator('.dialog').waitFor()
  if (!patch) return
  await page.evaluate(({ title, note, close }) => {
    const dlg = [...document.querySelectorAll('.dialog')].at(-1)
    dlg.querySelector('.dialog-header h3').textContent = title
    const n = dlg.querySelector('.dialog-body .dialog-note')
    if (note) n.textContent = note
    else n?.remove()
    const row = dlg.querySelector('.dialog-actions')
    row.querySelectorAll('.btn-primary').forEach((b) => b.remove())
    const ghost = row.querySelector('.btn-ghost, .btn')
    if (ghost) ghost.textContent = close
  }, patch)
}

async function notice(page, text) {
  await page.evaluate(
    ({ expr, text }) => {
      // eslint-disable-next-line no-new-func -- render script only, runs in the page
      new Function(`return ${expr}`)().showNotice(text)
    },
    { expr: piniaStore('diff'), text }
  )
  await page.waitForTimeout(250)
}

const STATES = {
  'share-a': async (page) => {
    await openShare(page)
    await addNearbyGroup(page)
  },
  'share-b': async (page) => {
    await openShare(page)
    await addNearbyButton(page)
  },
  'share-nobody': async (page) => {
    await openShare(page)
    await addNearbyGroup(page, { only: true })
  },
  'add-code': async (page) => {
    await openShare(page)
    await addNearbyGroup(page)
    await setStore(page, 'lan', {
      pairing: {
        id: 'x',
        role: 'adder',
        stage: 'enter-code',
        fp: NEARBY[0].fp,
        name: 'Ben Okafor',
        expiresAt: Date.now() + 110_000
      }
    })
    await page.locator('[data-testid=lan-code-input]').fill('K7Q 4ZP')
  },
  'add-waiting': async (page) => {
    await openShare(page)
    await addNearbyGroup(page)
    await showCode(page, {
      name: 'Ben Okafor',
      code: '4F7K',
      title: 'Waiting for Ben Okafor',
      note: 'Ben’s screen should show this code.',
      actions: ['Cancel']
    })
  },
  'share-after': async (page) => {
    await openShare(page)
    await page.evaluate((name) => {
      for (const row of document.querySelectorAll('.dialog .recipient')) {
        if (row.querySelector('.rc-name')?.textContent.trim() === name)
          row.querySelector('input')?.click()
      }
    }, 'Ben Okafor')
    await addNearbyGroup(page)
    await notice(page, 'Added Ben Okafor')
  },
  'holder-code': async (page) => {
    await showCode(page, { name: 'Ana Petrauskė', code: 'K7Q4ZP' })
  },
  'holder-confirm': async (page) => {
    await showCode(page, {
      name: 'Ana Petrauskė',
      code: '4F7K',
      title: 'Add Ana Petrauskė?',
      note: 'Check Ana’s screen shows the same code.',
      actions: ['Decline', 'Add Ana']
    })
  },
  'holder-added': async (page) => {
    await notice(page, 'Added Ana Petrauskė')
  },
  'add-mismatch': async (page) => adderResult(page, 'mismatch'),
  'add-declined': async (page) =>
    adderResult(page, 'mismatch', { title: 'Ben Okafor declined', note: null, close: 'Close' }),
  'add-expired': async (page) => adderResult(page, 'expired')
}

async function settingsNetwork(page) {
  await lanOn(page)
  await page.evaluate(() => document.querySelector('[data-testid=toolbar-settings]').click())
  await page.locator('.settings-nav').waitFor({ timeout: 8000 })
  await page.locator('.settings-nav .nav-group-row', { hasText: 'Integrations' }).click()
  await page.locator('.settings-nav .nav-child', { hasText: 'Network' }).click()
  await page.waitForTimeout(500)
  await lanOn(page)
  await page.locator('.network-settings .person').first().waitFor()
  await page.evaluate((old) => {
    for (const row of document.querySelectorAll('.network-settings .person')) {
      if (row.querySelector('.row-2-name')?.textContent.trim() !== old) continue
      const btn = row.querySelector('button')
      btn.disabled = true
      const status = document.createElement('span')
      status.className = 'status'
      for (const a of row.attributes)
        if (a.name.startsWith('data-v-')) status.setAttribute(a.name, '')
      status.textContent = 'Needs update'
      btn.before(status)
    }
  }, 'Chen Liu')
}

test('262 LAN add from Share', async () => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
  for (const theme of ['light', 'dark']) {
    for (const [name, draw] of Object.entries({ ...STATES, 'settings-network': settingsNetwork })) {
      if (ONLY && !ONLY.includes(name)) continue
      PEOPLE = BASE_PEOPLE.map((p) => ({ ...p }))
      NEARBY = BASE_NEARBY.map((n) => ({ ...n }))
      if (name === 'share-after') {
        const [ben] = NEARBY.splice(0, 1)
        PEOPLE.splice(1, 0, { label: ben.name, fingerprint: ben.fp, online: true })
      }
      const dir = freshUserDataDir()
      await seed(dir)
      const app = await launchApp(dir)
      try {
        const page = await firstReadyPage(app)
        await page.setViewportSize({ width: 1280, height: 800 })
        await seedSnippets(page)
        await page.evaluate((t) => window.api.storeSave('theme', t), theme)
        await page.evaluate(() => window.api.lanUpdate({ enabled: false }))
        await page.addInitScript(() =>
          Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' })
        )
        await page.reload()
        await page.locator('[data-testid=toolbar-settings]').waitFor()
        await page.waitForTimeout(600)
        await draw(page)
        await page.mouse.move(1270, 790)
        await page.waitForTimeout(350)
        await page.screenshot({ path: join(OUT, `${name}-${theme}.png`) })
      } finally {
        await app.close()
        rmSync(dir, { recursive: true, force: true })
      }
    }
  }
})
