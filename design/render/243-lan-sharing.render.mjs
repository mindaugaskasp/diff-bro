import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { test } from '../../e2e/fixtures.mjs'
import { SNIPPETS } from '../../scripts/lib/seedData.mjs'

// #243: LAN sharing, every approved state drawn over the live app (macOS emulated, so the gear and bell show).
const OUT = 'design/render/out/243'

const SVG = (inner, size = '') =>
  `<svg data-v-0fcb95f7="" class="app-icon" ${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
const P = (d) => `<path data-v-0fcb95f7="" d="${d}"></path>`
const ICON = {
  key: SVG(
    '<circle data-v-0fcb95f7="" cx="7.5" cy="15.5" r="5.5"></circle>' +
      P('m21 2-9.6 9.6') +
      P('m15.5 7.5 3 3L22 7l-3-3')
  ),
  code: SVG(P('m8 8-4 4 4 4M16 8l4 4-4 4')),
  diff: SVG(P('M7 4v6M4 7h6M4 17h6M15 4h5v16h-5')),
  clock: SVG('<circle data-v-0fcb95f7="" cx="12" cy="12" r="9"></circle>' + P('M12 7v5l3.5 2')),
  bell: SVG(P('M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9') + P('M13.73 21a2 2 0 0 1-3.46 0')),
  bellOff: SVG(
    P('M13.73 21a2 2 0 0 1-3.46 0') +
      P('M18.63 13A17.89 17.89 0 0 1 18 8') +
      P('M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14') +
      P('M18 8a6 6 0 0 0-9.33-5') +
      P('M2 2l20 20')
  ),
  send: SVG(P('M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z')),
  chevron: SVG(P('m6 9 6 6 6-6')),
  paste: SVG(
    '<rect data-v-0fcb95f7="" x="8" y="2" width="8" height="4" rx="1"></rect>' +
      P('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2')
  ),
  copy: SVG(
    '<rect data-v-0fcb95f7="" x="9" y="9" width="13" height="13" rx="2"></rect>' +
      P('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1')
  ),
  check: SVG(P('M20 6 9 17l-5-5')),
  x: SVG(P('M18 6 6 18M6 6l12 12'))
}

const CODE_BOX = (text, typed = true) =>
  `<div style="position: relative; height: 52px; box-sizing: border-box; border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; background: var(--field-face); border: 1px solid ${typed ? 'var(--accent)' : 'var(--field-edge)'}; ${typed ? 'box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);' : ''} font-family: var(--font-mono); font-size: 26px; font-weight: 600; letter-spacing: 6px; color: var(--text)">${text}${typed ? '' : `<button type="button" class="btn btn-sm" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: normal; gap: var(--space-1)">${ICON.paste} Paste</button>`}</div>`
const SHOWN_CODE_AT = (state) => {
  const face =
    state === 'copied'
      ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-raised))'
      : state === 'hover'
        ? 'color-mix(in srgb, var(--text) 13%, var(--bg-raised))'
        : 'color-mix(in srgb, var(--text) 8%, var(--bg-raised))'
  const edge =
    state === 'copied' ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'transparent'
  const hint =
    state === 'copied'
      ? `<span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 4px; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; font-size: var(--font-sm); font-weight: 500; letter-spacing: normal; color: var(--accent-ink)">${ICON.check} Copied</span>`
      : `<span style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); display: flex; font-size: 16px; color: ${state === 'hover' ? 'var(--text)' : 'var(--text-meta)'}">${ICON.copy}</span>`
  const tip =
    state === 'hover'
      ? `<span style="position: absolute; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); padding: 3px 8px; border-radius: var(--radius-sm); background: var(--text); color: var(--bg); font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; font-size: var(--font-xs); font-weight: 400; letter-spacing: normal; white-space: nowrap; z-index: 2">Click to copy</span>`
      : ''
  return `<button type="button" aria-label="Copy pairing code" style="position: relative; width: 100%; height: 52px; box-sizing: border-box; border-radius: var(--radius-lg); border: 1px solid ${edge}; display: flex; align-items: center; justify-content: center; background: ${face}; font-family: var(--font-mono); font-size: 26px; font-weight: 600; letter-spacing: 6px; color: var(--text); cursor: pointer; padding: 0">K7Q 4ZP${hint}${tip}</button>`
}
const SHOWN_CODE = SHOWN_CODE_AT('rest')
const WELL = (icon) => `<span class="glyph-well" data-hue="received">${icon}</span>`

function dialogHtml({ title, width = 440, body, actions }) {
  return `<div class="dialog-backdrop" data-lan-mock=""><div class="dialog" role="dialog" style="width: ${width}px"><div class="dialog-header"><h3>${title}</h3><button type="button" class="dialog-close" aria-label="Close">${ICON.x}</button></div><div class="dialog-body"><div style="display: flex; flex-direction: column; gap: var(--space-3)">${body}</div></div><div class="dialog-actions">${actions}</div></div></div>`
}
const ghost = (t) => `<button type="button" class="btn btn-ghost">${t}</button>`
const primary = (t, extra = '') =>
  `<button type="button" class="btn btn-primary" ${extra}>${t}</button>`
const destructive = (t) => `<button type="button" class="btn btn-destructive">${t}</button>`
const spacer = '<span style="flex: 1"></span>'
const note = (t) => `<p class="dialog-note" style="margin: 0">${t}</p>`

const SILENCE_OPTIONS = ['1 minute', '5 minutes', '10 minutes', '30 minutes', '1 hour', '1 day']
const SILENCE = (open) =>
  `<span style="position: relative; display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-sm); color: var(--text-meta)">Silence for<button type="button" class="btn btn-sm" aria-haspopup="menu" aria-expanded="${open}" style="gap: var(--space-1)">1 hour ${ICON.chevron}</button>` +
  `</span>`
const SILENCE_MENU =
  `<div class="popover" role="menu" data-lan-mock="" data-silence-menu="" style="position: fixed; right: auto; min-width: 230px; z-index: 100">` +
  SILENCE_OPTIONS.map(
    (o) =>
      `<button type="button" class="popover-row" role="menuitemradio" aria-checked="${o === '1 hour'}"><span style="width: 16px; display: inline-flex; color: var(--accent-ink)">${o === '1 hour' ? ICON.check : ''}</span>${o}</button>`
  ).join('') +
  `<div style="height: 1px; margin: var(--space-1) 0; background: color-mix(in srgb, var(--text) 10%, transparent)"></div><button type="button" class="popover-row stacked" role="menuitemradio" aria-checked="false" style="padding-left: calc(var(--space-3) + 16px + var(--space-2))"><span>Forever</span><span class="popover-why">Until you turn popups back on in Settings</span></button></div>`

const RECIPS = [
  ['Ana Petrauskė', 'ana@company.lt'],
  ['Ben Okafor', 'ben@company.lt'],
  ['Chen Liu', 'no address'],
  ['Dana Ruiz', 'dana@company.lt']
]
function SHARE({
  online = [true, true, false, false],
  picked = [true, false, false, false],
  labels = true,
  note: n = 'Sealed for 1 person. They get the same expiry you pick.',
  actions
} = {}) {
  const rows = RECIPS.map(([name, e], i) => {
    const on = online[i]
    const tag = labels
      ? `<span style="display: flex; align-items: center; gap: 6px; font-size: var(--font-xs); color: var(--text-meta)"><span style="width: 7px; height: 7px; border-radius: 50%; box-sizing: border-box; ${on ? 'background: var(--accent)' : 'border: 1px solid var(--text-meta)'}"></span>${on ? 'On your network' : 'Not on this network'}</span>`
      : ''
    const off = labels && !on
    return `<label class="row-2" style="padding: 0 var(--space-2); ${off ? 'opacity: 0.5; cursor: not-allowed' : ''}"><input type="checkbox" ${picked[i] && !off ? 'checked' : ''} ${off ? 'disabled' : ''} style="accent-color: var(--accent)"><span class="row-2-text"><span class="row-2-name" style="color: var(--text)">${name}</span><span class="row-2-meta">${e}</span></span>${tag}</label>`
  }).join('')
  return dialogHtml({
    title: 'Share diff',
    width: 452,
    body:
      `<div style="font-size: var(--font-sm); font-weight: 600; color: var(--text-meta)">Seal for</div><div style="display: flex; flex-direction: column; border-radius: var(--radius-lg); background: var(--field-face); border: 1px solid var(--field-edge); padding: var(--space-1) var(--space-2)">${rows}</div>` +
      note(n),
    actions:
      actions ||
      `<button type="button" class="btn btn-primary">${ICON.send} Send now</button><button type="button" class="btn btn-sm">Email</button><button type="button" class="btn btn-sm">Create file</button>` +
        spacer +
        ghost('Cancel')
  })
}
const NOBODY =
  `<button type="button" class="btn btn-primary" disabled>${ICON.send} Send now</button><button type="button" class="btn btn-sm" disabled>Email</button><button type="button" class="btn btn-sm" disabled>Create file</button>` +
  spacer +
  ghost('Cancel')

const DIALOGS = {
  'add-typed': dialogHtml({
    title: 'Add Ana Petrauskė',
    body:
      note('ana-mbp on your network') +
      `<label style="display: flex; flex-direction: column; gap: var(--space-2)"><span style="font-size: var(--font-sm); font-weight: 600; color: var(--text-meta)">Pairing code</span>${CODE_BOX('K7Q 4ZP')}</label>` +
      note('A wrong code cancels the request.'),
    actions: spacer + ghost('Cancel') + primary('Add')
  }),
  'add-paste-invalid': null,
  'add-empty': dialogHtml({
    title: 'Add Ana Petrauskė',
    body:
      note('ana-mbp on your network') +
      `<label style="display: flex; flex-direction: column; gap: var(--space-2)"><span style="font-size: var(--font-sm); font-weight: 600; color: var(--text-meta)">Pairing code</span>${CODE_BOX('<span style="color: var(--text-hint)">· · · · · ·</span>', false)}</label>` +
      note('A wrong code cancels the request.'),
    actions: spacer + ghost('Cancel') + primary('Add', 'disabled')
  }),
  'code-show': dialogHtml({
    title: 'Ben Okafor wants to add you',
    body:
      note('Share this code.') +
      SHOWN_CODE +
      `<p class="dialog-note" style="margin: 0; text-align: center">Expires in <span style="font-variant-numeric: tabular-nums; color: var(--text)">1:42</span></p>`,
    actions: spacer + ghost('Cancel')
  }),
  'code-copied': null,
  'add-mismatch': dialogHtml({
    title: 'Code didn’t match',
    body: note('Ask them to share their code again and retry.'),
    actions: spacer + ghost('Close') + primary('Try again')
  }),
  'request-cancelled': dialogHtml({
    title: 'Request cancelled',
    body: note('They cancelled the request.'),
    actions: spacer + primary('Close')
  }),
  'connection-lost': dialogHtml({
    title: 'Connection lost',
    body: note('Check you’re both on the same network and try again.'),
    actions: spacer + ghost('Close') + primary('Try again')
  }),
  'send-failed': dialogHtml({
    title: 'Couldn’t send',
    body: note('They’re not on your network any more. Create a file or email it instead.'),
    actions: spacer + ghost('Close') + primary('Create file')
  }),
  'share-dropped': SHARE({
    online: [false, true, false, false],
    note: 'No one picked is on your network now.',
    actions: NOBODY
  }),
  'share-no-network': SHARE({
    online: [false, false, false, false],
    note: 'Not connected to a network.',
    actions: NOBODY
  }),
  'share-lan-off': SHARE({
    labels: false,
    actions:
      `<button type="button" class="btn btn-primary">Email this diff</button><button type="button" class="btn btn-sm">Create file</button>` +
      spacer +
      ghost('Cancel')
  }),
  'share-sending': SHARE({
    actions:
      `<button type="button" class="btn btn-primary" disabled>Sending…</button><button type="button" class="btn btn-sm" disabled>Email</button><button type="button" class="btn btn-sm" disabled>Create file</button>` +
      spacer +
      ghost('Cancel')
  }),
  'expired-adder': dialogHtml({
    title: 'Code expired',
    body: note('Try again to get a new code.'),
    actions: spacer + ghost('Close') + primary('Try again')
  }),
  'expired-sender': dialogHtml({
    title: 'Code expired',
    body: note('Ask them to request a new pairing code.'),
    actions: spacer + primary('Close')
  }),
  'added-back': dialogHtml({
    title: 'Ben Okafor added you',
    body: `<p style="margin: 0">Add them too, so you can send to each other?</p>`,
    actions: spacer + ghost('Not now') + primary('Add back')
  }),
  'item-offer': dialogHtml({
    title: 'Ana Petrauskė shared a snippet',
    body: `<div style="display: flex; gap: var(--space-3); align-items: center">${WELL(ICON.code)}<div style="flex: 1; display: flex; flex-direction: column; gap: 2px"><span>nginx reload</span><span style="font-size: var(--font-sm); color: var(--text-meta)">ana-mbp · just now · deletes itself in 7 days</span></div><span class="count-pill">1 of 3</span></div>`,
    actions: SILENCE(false) + spacer + ghost('Decline') + primary('Open')
  }),
  'item-offer-menu': null,
  'stop-sharing': dialogHtml({
    title: 'Stop sharing with Ana Petrauskė?',
    body:
      `<p style="margin: 0">Removes their key. You won’t be able to open diffs or snippets they share, by file, email or on the network. Their 2 items waiting under the bell are deleted.</p>` +
      note('They’re told, and can add you again later with a new code.'),
    actions: spacer + ghost('Cancel') + destructive('Stop sharing')
  }),
  'revoke-told': dialogHtml({
    title: 'Jonas Kazlauskas stopped sharing with you',
    body: `<p style="margin: 0">You can’t send to them on the network any more. To share again, add them with a new code.</p>`,
    actions: spacer + primary('OK')
  }),
  'share-send': SHARE({})
}

DIALOGS['add-paste-invalid'] = DIALOGS['add-empty'].replace(
  note('A wrong code cancels the request.'),
  `<p class="dialog-note" style="margin: 0; color: var(--text)">The clipboard doesn’t hold a pairing code.</p>`
)
DIALOGS['code-copied'] = DIALOGS['code-show'].replace(SHOWN_CODE, SHOWN_CODE_AT('copied'))
DIALOGS['code-hover'] = DIALOGS['code-show'].replace(SHOWN_CODE, SHOWN_CODE_AT('hover'))
DIALOGS['item-offer-menu'] = DIALOGS['item-offer'].replace(
  'aria-expanded="false"',
  'aria-expanded="true"'
)

const NOTIFS = [
  {
    icon: ICON.key,
    title: 'Ben Okafor wants to add you',
    body: 'Your code is ready to share',
    time: '1:42 left',
    yes: 'Show code',
    hover: true
  },
  {
    icon: ICON.diff,
    title: 'Ben Okafor shared a diff',
    body: 'config.yaml ↔ config.prod.yaml',
    time: '5 min'
  },
  {
    icon: ICON.code,
    title: 'Ana Petrauskė shared a snippet',
    body: 'nginx reload',
    time: '20 min'
  },
  {
    icon: ICON.clock,
    title: 'Chen Liu’s request expired',
    body: 'Not answered in time',
    time: '32 min',
    faded: true
  }
]
const CARD = (n) =>
  `<div style="display: flex; flex-direction: column; gap: var(--space-2); padding: 10px 12px; border-radius: 12px; background: ${n.hover ? 'color-mix(in srgb, var(--text) 5%, var(--bg-raised))' : 'var(--bg-raised)'}; box-shadow: var(--shadow-1), inset 0 0 0 1px color-mix(in srgb, var(--text) 9%, transparent); border: 1px solid var(--tile-edge, transparent); ${n.faded ? 'opacity: 0.7;' : ''}">` +
  `<div style="display: flex; gap: 10px; align-items: flex-start">${WELL(n.icon)}<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px"><div style="display: flex; align-items: baseline; gap: var(--space-2)"><span style="flex: 1; min-width: 0; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${n.title}</span><span style="flex: none; font-size: var(--font-xs); color: var(--text-meta)">${n.time}</span></div><span style="font-size: var(--font-sm); color: var(--text-meta); white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${n.body}</span></div></div>` +
  (n.hover
    ? `<div style="display: flex; justify-content: flex-end; gap: var(--space-1)"><button type="button" class="btn btn-sm">Decline</button><button type="button" class="btn btn-sm">${n.yes}</button></div>`
    : '') +
  `</div>`
const BELL_LIST = (silenced) =>
  `<div class="popover" data-lan-mock="" style="width: 380px; right: 8px; top: 40px; position: fixed; padding: var(--space-2); gap: 6px; border-radius: 14px; background: var(--bg-canvas); border-color: var(--dialog-edge); box-shadow: var(--shadow-3), inset 0 0 0 1px color-mix(in srgb, var(--text) 14%, transparent)"><div style="display: flex; align-items: baseline; padding: 2px 4px 2px"><span style="flex: 1; font-weight: 600">Notifications</span><span style="font-size: var(--font-xs); color: var(--text-meta)">${silenced ? 'Silenced until 15:40' : '3 waiting'}</span></div>` +
  NOTIFS.map(CARD).join('') +
  `</div>`

const BELL_EMPTY = `<div class="popover" data-lan-mock="" style="width: 380px; right: 8px; top: 40px; position: fixed; padding: var(--space-2); gap: 6px; border-radius: 14px; background: var(--bg-canvas); border-color: var(--dialog-edge); box-shadow: var(--shadow-3), inset 0 0 0 1px color-mix(in srgb, var(--text) 14%, transparent)"><div style="padding: 2px 4px; font-weight: 600">Notifications</div><div style="padding: 28px 12px; text-align: center; color: var(--text-meta); border-radius: 12px; background: var(--bg-raised); box-shadow: var(--shadow-1), inset 0 0 0 1px color-mix(in srgb, var(--text) 9%, transparent)">Nothing waiting</div></div>`

const TOAST = (text) =>
  `<div data-lan-mock="" style="position: fixed; left: 50%; bottom: 44px; transform: translateX(-50%); z-index: 50; padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); background: var(--bg-raised); box-shadow: var(--shadow-2); border: 1px solid var(--dialog-edge); font-size: var(--font-md); white-space: nowrap">${text}</div>`

const BAND = `<div data-lan-mock="" class="band" style="gap: var(--space-3); min-height: var(--band-row); padding: 0 var(--space-3); border-bottom: 1px solid color-mix(in srgb, var(--hue-received) 70%, var(--text)); background: color-mix(in srgb, var(--hue-received) 10%, var(--bg)); color: var(--text)">${WELL(ICON.code)}<span style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis"><strong style="font-weight: 600">From Ana Petrauskė</strong><span style="margin-left: var(--space-1); color: var(--text-meta)">deletes itself in 7 days</span></span><button type="button" class="btn btn-ghost">Discard</button><button type="button" class="btn btn-primary">Save snippet</button></div>`

async function clear(page) {
  await page.evaluate(() => document.querySelectorAll('[data-lan-mock]').forEach((e) => e.remove()))
}

async function addBell(page, { count, silenced }) {
  await page.evaluate(
    ({ icon, count }) => {
      const gear = document.querySelector('[data-testid=toolbar-settings]')
      const b = gear.cloneNode(false)
      b.removeAttribute('data-testid')
      b.setAttribute('data-lan-mock', '')
      b.setAttribute('aria-label', 'Notifications')
      b.style.position = 'relative'
      b.innerHTML =
        icon +
        (count
          ? `<span style="position: absolute; top: -4px; right: -5px; min-width: 16px; height: 16px; box-sizing: border-box; padding: 0 4px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: var(--accent); color: var(--text-on-accent); font-size: 10px; font-weight: 600; line-height: 1">${count}</span>`
          : '')
      gear.parentNode.insertBefore(b, gear)
    },
    { icon: silenced ? ICON.bellOff : ICON.bell, count }
  )
}

async function inject(page, html, where = 'body') {
  await page.evaluate(
    ({ html, where }) => {
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      const host = where === 'body' ? document.body : document.querySelector(where)
      host.insertAdjacentHTML(where === 'body' ? 'beforeend' : 'beforebegin', html)
    },
    { html, where }
  )
  await page.waitForTimeout(200)
}

async function openNetworkSettings(page) {
  await page.evaluate(() => document.querySelector('[data-testid=toolbar-settings]').click())
  await page.locator('.settings-nav').waitFor({ timeout: 8000 })
  await page.locator('.settings-nav .nav-group-row', { hasText: 'Integrations' }).click()
  await page.locator('.settings-nav .nav-child', { hasText: 'Claude' }).click()
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const nav = document.querySelector('.settings-nav')
    const kids = [...nav.querySelectorAll('.nav-child')]
    kids.forEach((k) => {
      k.classList.remove('active')
      k.removeAttribute('aria-current')
      k.style.background = 'transparent'
      k.style.fontWeight = '400'
    })
    const email = kids.find((k) => k.textContent.trim() === 'Email')
    const net = email.cloneNode(true)
    net.querySelector('.nav-label').textContent = 'Network'
    net.classList.add('active')
    net.style.background = ''
    net.style.fontWeight = ''
    net.setAttribute('aria-current', 'page')
    email.parentNode.insertBefore(net, email.nextSibling)

    const pane = document.querySelector('.settings-pane')
    const section = pane.querySelector('section')
    const h4 = section.querySelector('h4')
    const toggle = section.querySelector('.setting-toggle')
    const copyV = (from, to) =>
      [...from.attributes]
        .filter((a) => a.name.startsWith('data-v-'))
        .forEach((a) => to.setAttribute(a.name, ''))
    const mk = (tag, text, from) => {
      const e = document.createElement(tag)
      e.textContent = text
      if (from) copyV(from, e)
      return e
    }
    const tgl = (label, checked) => {
      const t = toggle.cloneNode(true)
      t.classList.remove('disabled')
      const input = t.querySelector('input')
      input.disabled = false
      input.checked = checked
      t.querySelector('span').textContent = label
      return t
    }
    const fresh = section.cloneNode(false)
    fresh.className = ''
    copyV(section, fresh)
    const p = (text) => {
      const e = document.createElement('p')
      e.className = 'dialog-note'
      e.textContent = text
      return e
    }
    fresh.append(
      mk('h4', 'Network', h4),
      tgl('Share on this network', true),
      p(
        'People running Diff Bro on the same network can add you. Once you have added each other, you can send diffs and snippets.'
      ),
      tgl('Show me to others', true),
      p('When off, nobody new can add you. People you have already added can still send to you.'),
      tgl('Show popups', true),
      p('When off, add requests and shared items wait under the bell.')
    )
    const name = document.createElement('div')
    name.style.cssText =
      'display: flex; align-items: center; gap: var(--space-3); margin: var(--space-2) 0 var(--space-4); text-align: left'
    name.innerHTML =
      '<span style="flex: none; width: 140px">Name others see</span><span style="flex: 1; height: var(--control-h); box-sizing: border-box; display: flex; align-items: center; padding: 0 var(--space-3); border-radius: var(--radius-sm); background: var(--field-face); border: 1px solid var(--field-edge); color: var(--text)">Jonas’s MacBook Pro</span>'
    fresh.append(name, mk('h4', 'People on this network', h4))
    const people = [
      ['Ana Petrauskė', 'ana-mbp', 'Trusted', true],
      ['Ben Okafor', 'ben-xps', 'Trusted', true],
      ['Chen Liu', 'chen-thinkpad', '', false]
    ]
    for (const [n, host, status, trusted] of people) {
      const row = document.createElement('div')
      row.className = 'row-2'
      row.setAttribute('data-person', n)
      row.style.cssText =
        'padding: 0 var(--space-2); border-radius: 0; border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent)'
      row.innerHTML =
        `<span class="row-2-text"><span class="row-2-name">${n}</span><span class="row-2-meta">${host}</span></span>` +
        (trusted
          ? `<span style="font-size: var(--font-sm); color: var(--text-meta)">${status}</span><button type="button" class="btn btn-sm btn-ghost">Stop sharing</button>`
          : '<button type="button" class="btn btn-sm">Add</button>')
      fresh.append(row)
    }
    pane.replaceChildren(fresh)
  })
  await page.waitForTimeout(300)
}

async function anaRevoked(page) {
  await page.evaluate(() => {
    const row = document.querySelector('[data-person="Ana Petrauskė"]')
    row.querySelector('.row-2-text').nextElementSibling.remove()
    row.lastElementChild.outerHTML = '<button type="button" class="btn btn-sm">Add</button>'
  })
}

async function closeSettings(page) {
  await page.evaluate(() =>
    document.querySelectorAll('.dialog-backdrop').forEach((d) => d.remove())
  )
}

const ONLY = process.env.LAN_ONLY ? process.env.LAN_ONLY.split(',') : null
const THEMES = [
  'light',
  'dark',
  'solar',
  'neon',
  'nord',
  'sepia',
  'dim',
  'beacon',
  'meridian',
  'linen',
  'bloom',
  'nyan',
  'matrix',
  'contrast',
  'volcano',
  'amber',
  'tide',
  'ember',
  'graphite',
  'vector'
]
async function run({ page, OUT }) {
  if (process.env.LAN_THEMES) {
    for (const t of THEMES) {
      await page.evaluate((x) => window.api.storeSave('theme', x), t)
      await page.reload()
      await page.locator('[data-testid=toolbar-settings]').waitFor()
      await page.locator('.home-row').nth(3).click()
      await page.waitForTimeout(500)
      await addBell(page, { count: 3 })
      await inject(page, BELL_LIST(false))
      await page.screenshot({
        path: join(OUT, `theme-${t}.png`),
        clip: { x: 880, y: 0, width: 400, height: 345 }
      })
      await clear(page)
    }
    return
  }
  const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) })
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => window.api.storeSave('theme', t), theme)
    await page.reload()
    await page.locator('[data-testid=toolbar-settings]').waitFor()
    await page.locator('.home-row').nth(3).click()
    await page.waitForTimeout(800)
    for (const name of ONLY || [
      'add-paste-invalid',
      'request-cancelled',
      'connection-lost',
      'send-failed',
      'share-dropped',
      'share-no-network',
      'share-lan-off',
      'share-sending',
      'add-empty',
      'add-typed',
      'code-show',
      'add-mismatch',
      'code-hover',
      'code-copied',
      'expired-adder',
      'expired-sender',
      'added-back',
      'item-offer',
      'item-offer-menu',
      'share-send',
      'revoke-told'
    ]) {
      await inject(page, DIALOGS[name])
      if (name === 'item-offer-menu') {
        await inject(page, SILENCE_MENU)
        await page.evaluate(() => {
          const r = document.querySelector('[aria-expanded="true"]').getBoundingClientRect()
          const m = document.querySelector('[data-silence-menu]')
          m.style.top = `${r.bottom + 6}px`
          m.style.left = `${r.left}px`
        })
      }
      await shot(`${name}-${theme}`)
      await clear(page)
    }
    if (ONLY && !ONLY.includes('silenced')) continue
    await inject(page, BAND, '.head-band')
    await shot(`item-opened-${theme}`)
    await clear(page)

    await addBell(page, { count: 3 })
    await shot(`bell-badge-${theme}`)
    await inject(page, BELL_LIST(false))
    await shot(`bell-list-${theme}`)
    await clear(page)

    await addBell(page, { count: 3, silenced: true })
    await inject(page, TOAST('Popups silenced for 1 hour'))
    await shot(`silenced-${theme}`)
    await clear(page)
    await addBell(page, { count: 3, silenced: true })
    await inject(page, TOAST('Popups off until you turn them back on in Settings'))
    await shot(`silenced-forever-${theme}`)
    await clear(page)
    await addBell(page, { count: 3 })
    await inject(page, TOAST('3 items waiting under the bell'))
    await shot(`item-later-${theme}`)
    await clear(page)
    await addBell(page, { count: 0 })
    await inject(page, BELL_EMPTY)
    await shot(`bell-empty-${theme}`)
    await clear(page)
    await inject(page, TOAST('Sent to Ana Petrauskė'))
    await shot(`sent-${theme}`)
    await clear(page)

    await addBell(page, { count: 0 })
    await openNetworkSettings(page)
    await shot(`network-${theme}`)
    await inject(page, DIALOGS['stop-sharing'])
    await shot(`stop-sharing-${theme}`)
    await clear(page)
    await anaRevoked(page)
    await inject(page, TOAST('Stopped sharing with Ana Petrauskė. They’ve been told.'))
    await shot(`stopped-${theme}`)
    await clear(page)
    await closeSettings(page)
    for (const variant of ['offline', 'off']) {
      await page.evaluate((t) => window.api.storeSave('theme', t), theme)
      await page.reload()
      await page.locator('[data-testid=toolbar-settings]').waitFor()
      await page.locator('.home-row').nth(3).click()
      await page.waitForTimeout(600)
      await openNetworkSettings(page)
      await page.evaluate((v) => {
        const rows = [...document.querySelectorAll('[data-person]')]
        const head = [...document.querySelectorAll('.settings-pane h4')].find(
          (h) => h.textContent === 'People on this network'
        )
        rows.forEach((r) => r.remove())
        if (v === 'offline') {
          const p = document.createElement('p')
          p.className = 'dialog-note'
          p.textContent = 'Not connected to a network.'
          head.after(p)
        } else {
          head.remove()
          const toggles = [...document.querySelectorAll('.settings-pane .setting-toggle')]
          toggles[0].querySelector('input').checked = false
          toggles.slice(1).forEach((t) => {
            t.classList.add('disabled')
            t.querySelector('input').disabled = true
          })
          const name = document.querySelector(
            '.settings-pane div[style*="140px"], .settings-pane span[style*="140px"]'
          )
          if (name) name.closest('div').style.opacity = '0.5'
        }
      }, variant)
      await shot(`network-${variant}-${theme}`)
      await closeSettings(page)
    }
  }
}

async function seed(page) {
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
    await window.api.storeSave('theme', 'light')
    await window.api.storeSave(
      'onboarding',
      JSON.stringify({ schema: 2, offerTours: true, tours: {}, offer: false, tips: { on: false } })
    )
  }, SNIPPETS)
}

test('243 LAN sharing', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' })
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await seed(page)
  await page.reload()
  await page.locator('[data-testid=toolbar-settings]').waitFor()
  await run({ page, OUT })
})
