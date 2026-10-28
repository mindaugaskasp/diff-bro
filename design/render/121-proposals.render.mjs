import {
  test,
  expect,
  showPanel,
  openNewSnippet,
  docActions,
  clickAppMenuItem
} from '../../e2e/fixtures.mjs'
import { installKit } from './kit.mjs'

// #121: Claude proposals in their panel, nested tag sections, search by tag.
const OUT = 'design/render/out/121'
const NAMES = [
  ['Rollback', 'ops/k8s/prod'],
  ['Nginx rate limit', 'ops/nginx'],
  ['Drain a node', 'ops/k8s/prod'],
  ['Tail pod logs', 'ops/k8s'],
  ['Postgres vacuum', 'data/prod'],
  ['Find slow queries', 'data'],
  ['Rotate TLS cert', 'ops/nginx'],
  ['Git: undo last commit', 'dev/git'],
  ['Git: prune branches', 'dev/git'],
  ['Port-forward a service', 'ops/k8s'],
  ['Disk usage by folder', 'dev'],
  ['JWT decode one-liner', 'dev']
]
const STATES = [
  'rest',
  'volume',
  'selecting',
  'open',
  'accepted',
  'discarded',
  'diffs',
  'typing',
  'refused',
  'search',
  'hash',
  'scoped'
]

function overlay({ state, names }) {
  const {
    $,
    $$,
    el,
    svg,
    btn,
    shown,
    ICON,
    row,
    tagHead: head,
    railPending,
    proposedTab,
    reviewBar,
    notice,
    tagChip,
    dropdown
  } = window.dk
  const C = { ops: '#18b46d', nginx: '#00a7d8', data: '#d68200', dev: '#ea6c5a' }
  const diffs = state === 'diffs'
  const accepted = state === 'accepted'
  const quiet = ['search', 'hash', 'scoped', 'typing', 'refused'].includes(state)

  function hideNear(search) {
    const sr = search.getBoundingClientRect()
    const mid = (r) => r.top + r.height / 2
    $$('button')
      .filter((b) => {
        const q = b.getBoundingClientRect()
        return (
          !b.closest('.field-search') &&
          Math.abs(mid(q) - mid(sr)) < 10 &&
          q.left >= sr.right - 2 &&
          q.left < sr.right + 60
        )
      })
      .forEach((b) => (b.style.display = 'none'))
  }
  function chrome() {
    window.dk.designFont()
    $$('.usb-shelf').forEach((s) => (s.style.display = 'none'))
    const search = $('.field-search')
    const input = $('input', search)
    input.placeholder = `Search ${diffs ? 'diffs' : 'snippets'}, or # for a tag`
    const hashBtn = btn('#')
    hashBtn.style.cssText =
      'height:20px;min-width:22px;padding:0 6px;font-weight:700;margin-right:2px;flex:none'
    search.appendChild(hashBtn)
    hideNear(search)
    const railCount = $('.rail-item[data-panel="snippets"] .rail-count')
    if (railCount) railCount.textContent = accepted ? '15' : '14'
    window.dk.keepTabs(['Restart api', 'Drain a node'])
    return { search, input, hashBtn }
  }
  function listHost() {
    const secHead = $(`.section-head[data-section="${diffs ? 'saved' : 'snippets'}"]`)
    $('.count-chip', secHead).textContent = diffs ? '3' : accepted ? '15' : '14'
    const sec = secHead.parentElement
    $$('[class*="empty"]', sec).forEach((e) => (e.style.display = 'none'))
    let ul = $('ul', sec)
    if (!ul) {
      ul = el('ul', 'list-style:none;margin:0;padding:0')
      secHead.after(ul)
    }
    return { secHead, ul }
  }
  const restSelected = !['open', 'accepted', 'typing', 'refused'].includes(state)
  const TREES = {
    snippets: () => [
      head({ label: 'Favourites', n: 1, star: true }),
      head({ label: 'ops', n: accepted ? 8 : 7, open: true, color: C.ops }),
      head({ label: 'k8s', n: accepted ? 5 : 4, depth: 1, open: true, color: C.ops }),
      head({ label: 'prod', n: accepted ? 3 : 2, depth: 2, open: true, color: C.ops }),
      ...(accepted ? [row({ name: 'Rollback', depth: 3, isNew: true, selected: true })] : []),
      row({ name: 'Restart api', depth: 3, selected: restSelected }),
      row({ name: 'Drain a node', depth: 3 }),
      head({ label: 'staging', n: 1, depth: 2, color: C.ops }),
      row({ name: 'Tail pod logs', depth: 2 }),
      head({ label: 'nginx', n: 3, depth: 1, color: C.nginx }),
      head({ label: 'data', n: 3, color: C.data }),
      head({ label: 'dev', n: 3, color: C.dev }),
      head({ label: 'Untagged', n: 2 })
    ],
    search: () => [
      head({ label: 'ops', n: 2, open: true, color: C.ops }),
      head({ label: 'k8s', n: 2, depth: 1, open: true, color: C.ops }),
      head({ label: 'prod', n: 2, depth: 2, open: true, color: C.ops }),
      row({ name: 'Restart api', depth: 3, meta: 'tag ops/k8s/prod' }),
      row({ name: 'Drain a node', depth: 3, meta: 'tag ops/k8s/prod' }),
      head({ label: 'data', n: 2, open: true, color: C.data }),
      head({ label: 'prod', n: 1, depth: 1, open: true, color: C.data }),
      row({ name: 'Postgres vacuum', mono: 'SQL', depth: 2, meta: 'tag data/prod' }),
      row({ name: 'Products export', mono: 'SQL', depth: 1, meta: 'name' }),
      head({ label: 'dev', n: 1, open: true, color: C.dev }),
      row({ name: 'Prod smoke test', depth: 1, meta: 'name' })
    ],
    scoped: () => [
      head({ label: 'ops', n: 1, open: true, color: C.ops }),
      head({ label: 'k8s', n: 1, depth: 1, open: true, color: C.ops }),
      head({ label: 'prod', n: 1, depth: 2, open: true, color: C.ops }),
      row({ name: 'Rollback', depth: 3, selected: true, meta: 'name' })
    ],
    diffs: () => [
      head({ label: 'Favourites', n: 1, star: true }),
      head({ label: 'ops', n: 3, open: true, color: C.ops }),
      head({ label: 'nginx', n: 2, depth: 1, open: true, color: C.nginx }),
      row({ name: 'nginx.conf before ↔ after', mono: 'CONF', hue: 'diff', depth: 2 }),
      row({ name: 'rate limit v1 ↔ v2', mono: 'CONF', hue: 'diff', depth: 2 }),
      row({ name: 'api.json v1 ↔ v2', mono: 'JSON', hue: 'diff', depth: 1 }),
      head({ label: 'data', n: 2, color: C.data }),
      head({ label: 'Untagged', n: 1 })
    ]
  }
  function pendingList() {
    if (quiet) return []
    if (diffs) return [['config.yaml prod ↔ staging', 'ops']]
    if (accepted || state === 'discarded') return names.slice(1, 3)
    return state === 'volume' || state === 'selecting' ? names : names.slice(0, 3)
  }
  function selectionBar() {
    const bar = el(
      'div',
      'margin-top:4px;display:flex;align-items:center;gap:6px;padding:6px var(--space-2);border-radius:var(--radius);background:var(--bg);border:1px solid var(--border);font-size:var(--font-sm);color:var(--text)'
    )
    bar.append(
      el('span', 'flex:1', '3 selected'),
      btn('Discard 3'),
      btn('Accept 3', 'btn btn-sm btn-primary')
    )
    return bar
  }
  function proposalsGroup(ul, list) {
    const selecting = state === 'selecting'
    const g = el('div', 'margin:var(--space-2) var(--space-2) 0;display:flex;flex-direction:column')
    const gh = el(
      'div',
      'height:32px;display:flex;align-items:center;gap:8px;padding:0 var(--space-2);border-radius:var(--radius);background:color-mix(in srgb, var(--hue-received) 12%, var(--bg-panel));font-weight:650;color:var(--text)'
    )
    const gi = svg(ICON.spark, '13px')
    gi.style.color = 'var(--glyph-received)'
    gh.append(
      gi,
      el('span', 'flex:1', `From Claude · ${list.length}`),
      btn(selecting ? 'Done' : 'Select')
    )
    g.append(gh)
    if (selecting) g.append(selectionBar())
    const gl = el('ul', 'list-style:none;margin:0;padding:2px 0 0;max-height:184px;overflow-y:auto')
    list.forEach(([name, tag], i) =>
      gl.append(
        row({
          name,
          meta: tag,
          proposed: true,
          open: (state === 'open' && i === 0) || diffs,
          box: selecting,
          checked: selecting && i < 3
        })
      )
    )
    g.append(
      gl,
      el('div', 'height:1px;margin:var(--space-2) var(--space-3) 2px;background:var(--border)')
    )
    ul.before(g)
  }
  function tagEntry(addTag, refused) {
    addTag?.before(tagChip('ops/k8s/', 'prod'))
    const edge = refused ? 'var(--danger-border)' : 'var(--accent)'
    const inp = el(
      'input',
      `height:var(--chip-h);border-radius:var(--radius-pill);border:1px solid ${edge};background:var(--bg);color:var(--text);padding:0 9px;font:inherit;font-size:var(--font-sm);width:150px`
    )
    inp.value = refused ? 'ops/k8s/prod/eu' : 'ops/k8s/st'
    addTag?.replaceWith(inp)
    if (!refused)
      return dropdown(inp, [
        ['ops/k8s/', 'staging', '1'],
        ['ops/k8s/', 'st', 'new']
      ])
    const r = inp.getBoundingClientRect()
    document.body.append(
      el(
        'div',
        `position:fixed;left:${r.left}px;top:${r.bottom + 6}px;font-size:var(--font-sm);color:var(--danger-border);z-index:50`,
        'Tags nest up to 3 levels. "ops/k8s/prod" is the deepest this can go.'
      )
    )
  }
  const visibleAddTag = () =>
    $$('button')
      .filter(shown)
      .find((b) => /Add tag/.test(b.textContent)) ||
    $$('input')
      .filter(shown)
      .find((i) => /add a tag/i.test(i.placeholder || ''))
  const DECOR = {
    open: () => {
      proposedTab('Rollback · proposed')
      reviewBar(
        $('.snippet-doc:not([style*="display: none"])') || $('.snippet-doc'),
        'The inverse of Restart api',
        'Accept · add to Snippets'
      )
      visibleAddTag()?.before(tagChip('ops/k8s/', 'prod', { suggested: true }))
      $$('#toolbar-doc-actions button')
        .filter((b) => b.textContent.trim() === 'Save')
        .forEach((b) => (b.style.display = 'none'))
    },
    accepted: () => {
      visibleAddTag()?.before(tagChip('ops/k8s/', 'prod'))
      notice('Added Rollback to Snippets')
    },
    discarded: () => notice('Discarded Rollback'),
    diffs: () => {
      proposedTab('config.yaml prod ↔ staging · proposed')
      reviewBar(
        $('.diff-container').parentElement,
        'The two files you mentioned',
        'Accept · save diff'
      )
    },
    search: ({ input, secHead }) => {
      input.value = 'prod'
      const hits = el(
        'div',
        'display:flex;flex-direction:column;gap:4px;padding:6px var(--space-3);border-bottom:1px solid var(--border)'
      )
      const chips = el('div', 'display:flex;flex-wrap:wrap')
      chips.append(tagChip('ops/k8s/', 'prod'), tagChip('data/', 'prod', { color: C.data }))
      hits.append(
        el('span', 'font-size:var(--font-xs);font-weight:650;color:var(--text-meta)', 'Tags'),
        chips
      )
      secHead.after(hits)
    },
    hash: ({ input, search }) => {
      input.value = '#k8'
      dropdown(
        search,
        [
          ['ops/', 'k8s', '4'],
          ['ops/k8s/', 'prod', '2'],
          ['ops/k8s/', 'staging', '1']
        ],
        'Search inside a tag'
      )
    },
    scoped: ({ input, hashBtn }) => {
      input.value = 'roll'
      const chip = tagChip('ops/', 'k8s')
      chip.style.marginLeft = '4px'
      chip.append(svg(ICON.x, '11px'))
      input.before(chip)
      hashBtn.remove()
    },
    typing: () => tagEntry(visibleAddTag(), false),
    refused: () => tagEntry(visibleAddTag(), true)
  }

  const bits = chrome()
  const { secHead, ul } = listHost()
  ul.replaceChildren(...(TREES[state] ?? TREES.snippets)())
  const list = pendingList()
  if (list.length) proposalsGroup(ul, list)
  const pending = diffs ? 3 : list.length
  if (pending) railPending('snippets', pending)
  railPending('diffs', 1)
  DECOR[state]?.({ ...bits, secHead })
}

async function createSnippet(page, name, body) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type(body)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function paste(page, left, right) {
  await page
    .locator('.diff-tabs')
    .getByRole('button', { name: 'New comparison', exact: true })
    .click()
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill(left)
  await page.getByPlaceholder('Paste or type the changed text').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()
}

const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme)
async function ensureTheme(app, page, theme) {
  if ((await themeOf(page)) !== theme) await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
  await expect.poll(() => themeOf(page)).toBe(theme)
}

async function prepare(page, state) {
  if (state === 'diffs') {
    await showPanel(page, 'diffs')
    await paste(
      page,
      'replicas: 3\nimage: api:1.41\nenv: production\nlog_level: warn',
      'replicas: 3\nimage: api:1.42\nenv: production\nlog_level: debug'
    )
  }
  await showPanel(page, 'snippets')
  await page.locator('li.row').first().waitFor()
  await page.evaluate(() => window.dk.keepRowTemplate())
  if (state === 'diffs') await showPanel(page, 'diffs')
  if (['open', 'typing', 'refused'].includes(state)) {
    await openNewSnippet(page)
    const ed = page.getByRole('region', { name: 'New snippet' })
    await ed.getByPlaceholder('Snippet name…').fill('Rollback')
    await ed.locator('.editor').click()
    await page.keyboard.type(
      '# Roll the api deployment back one revision\nkubectl rollout undo deployment/api'
    )
  }
  if (state === 'accepted') {
    await createSnippet(page, 'Rollback', 'kubectl rollout undo deployment/api')
    await page.locator('li.row', { hasText: 'Rollback' }).locator('.entry').click()
  }
  if (['rest', 'volume', 'selecting', 'discarded', 'search', 'hash', 'scoped'].includes(state)) {
    await page.locator('li.row', { hasText: 'Restart api' }).locator('.entry').click()
  }
}

for (const theme of ['light', 'dark']) {
  test(`121 ${theme}`, async ({ app, page }) => {
    await page.setViewportSize({ width: 1280, height: 760 })
    await createSnippet(page, 'Restart api', 'kubectl rollout restart deployment/api')
    await createSnippet(page, 'Drain a node', 'kubectl drain node-1 --ignore-daemonsets')
    for (const state of STATES) {
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(600)
      await ensureTheme(app, page, theme)
      await page.evaluate(installKit)
      await prepare(page, state)
      await page.waitForTimeout(500)
      await ensureTheme(app, page, theme)
      await page.mouse.move(1270, 750)
      await page.evaluate(overlay, { state, names: NAMES })
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${OUT}/${theme}-${state}.png` })
    }
  })
}
