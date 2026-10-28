// Page-side helpers that draw a redesign over the live app's own components.
// `await page.evaluate(installKit)` defines window.dk; a render then calls it.
export function installKit() {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const el = (tag, css = '', text = '') => {
    const e = document.createElement(tag)
    if (css) e.style.cssText = css
    if (text) e.textContent = text
    return e
  }
  const svg = (d, size = '1em') => {
    const ns = 'http://www.w3.org/2000/svg'
    const s = document.createElementNS(ns, 'svg')
    const attrs = { viewBox: '0 0 24 24', class: 'app-icon', fill: 'none', stroke: 'currentColor' }
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v))
    s.setAttribute('stroke-width', '2')
    s.setAttribute('stroke-linecap', 'round')
    s.setAttribute('stroke-linejoin', 'round')
    s.style.width = size
    s.style.height = size
    const p = document.createElementNS(ns, 'path')
    p.setAttribute('d', d)
    s.appendChild(p)
    return s
  }
  const btn = (label, cls = 'btn btn-sm') => {
    const b = el('button', '', label)
    b.className = cls
    b.type = 'button'
    return b
  }
  const shown = (e) => e.offsetParent !== null

  const ICON = {
    spark: 'M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z',
    star: 'M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94z',
    chevronDown: 'm6 9 6 6 6-6',
    chevronRight: 'm9 6 6 6-6 6',
    x: 'M18 6 6 18M6 6l12 12'
  }
  const RECV_EDGE = 'color-mix(in srgb, var(--hue-received) 70%, var(--text))'
  const SELECTED = 'color-mix(in srgb, var(--accent) 16%, var(--bg-panel))'

  function designFont() {
    const root = document.documentElement
    root.style.setProperty('--font-md', '13px')
    root.style.setProperty('--font-sm', '12px')
    root.style.setProperty('--font-xs', '11px')
    document.body.style.fontFamily = "-apple-system, 'Segoe UI', system-ui, sans-serif"
    document.body.style.fontSize = '13px'
  }

  // Clone of a real sidebar row: capture one with `dk.keepRowTemplate()` first.
  function keepRowTemplate() {
    window.__dkRow = $('li.row').cloneNode(true)
  }
  function markProposed(li, open) {
    $('.star', li)?.remove()
    $('.rowacts', li)?.remove()
    const fill = open
      ? 'color-mix(in srgb, var(--hue-received) 14%, var(--bg))'
      : 'color-mix(in srgb, var(--hue-received) 5%, var(--bg-panel))'
    li.classList.add('dk-proposal')
    li.style.cssText = `outline:1px ${open ? 'solid' : 'dashed'} ${RECV_EDGE};outline-offset:-1px;border-radius:var(--radius);margin:3px 0;background:${fill}`
  }
  function addCheckbox(li, checked) {
    const c = el('input', 'margin:0 6px 0 2px;accent-color:var(--hue-received);flex:none')
    c.type = 'checkbox'
    c.checked = !!checked
    $('.entry', li).prepend(c)
  }
  function setMonogram(li, o) {
    const mono = $('.monogram', li)
    mono.dataset.hue = o.proposed ? 'received' : (o.hue ?? 'snippet')
    mono.textContent = o.proposed ? '' : (o.mono ?? 'SH')
    if (o.proposed) mono.appendChild(svg(ICON.spark, '14px'))
  }
  function row(o) {
    const li = window.__dkRow.cloneNode(true)
    li.classList.remove('is-new')
    li.removeAttribute('data-new-row')
    $('.nm', li).textContent = o.name
    setMonogram(li, o)
    $('.row-2-meta', li).textContent = o.meta ?? ''
    if (!o.isNew) $('.new-badge', li)?.remove()
    if (o.proposed) markProposed(li, o.open)
    if (o.depth) li.style.paddingLeft = `${o.depth * 16}px`
    if (o.selected) {
      li.style.background = SELECTED
      li.classList.add('dk-selected')
    }
    if (o.box) addCheckbox(li, o.checked)
    return li
  }
  function tagHead({ label, n, depth = 0, open = false, color = '', star = false }) {
    const li = el(
      'li',
      `list-style:none;display:flex;align-items:center;gap:6px;height:28px;padding:0 var(--space-3) 0 calc(var(--space-3) + ${depth * 16}px);font-size:var(--font-sm);font-weight:650;color:var(--text)`
    )
    li.className = 'dk-taghead'
    const chev = svg(open ? ICON.chevronDown : ICON.chevronRight, '12px')
    chev.style.color = 'var(--text-meta)'
    li.append(chev)
    if (color)
      li.append(el('span', `width:7px;height:7px;border-radius:50%;background:${color};flex:none`))
    if (star) {
      const s = svg(ICON.star, '12px')
      s.style.color = 'var(--favorite)'
      li.append(s)
    }
    li.append(
      el('span', 'flex:1', label),
      el('span', 'color:var(--text-meta);font-weight:400', String(n))
    )
    return li
  }
  function railPending(panel, n) {
    const well = $(`.rail-item[data-panel="${panel}"] .rail-well`)
    const p = $('.rail-count').cloneNode(true)
    p.textContent = ''
    p.append(svg(ICON.spark, '9px'), String(n))
    p.style.cssText =
      'right:auto;left:calc(var(--space-3) * -1);background:var(--hue-received);color:#fff;border-color:var(--hue-received);display:inline-flex;align-items:center;gap:1px'
    well.appendChild(p)
  }
  function proposedTab(label) {
    const name = $('.tab.active .name')
    name.textContent = label
    name.style.fontStyle = 'italic'
    $('.tab.active').style.boxShadow = `inset 0 -2px 0 ${RECV_EDGE}`
    const ic = svg(ICON.spark, '12px')
    ic.style.color = 'var(--glyph-received)'
    ic.style.marginRight = '4px'
    name.before(ic)
  }
  function reviewBar(anchor, note, accept) {
    const bar = el(
      'div',
      `display:flex;align-items:center;gap:10px;padding:var(--space-2) var(--space-3);background:color-mix(in srgb, var(--hue-received) 10%, var(--bg));border-bottom:1px solid ${RECV_EDGE};color:var(--text);font-size:var(--font-md)`
    )
    const well = el(
      'span',
      'width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);flex:none'
    )
    well.className = 'glyph-well'
    well.dataset.hue = 'received'
    well.append(svg(ICON.spark, '13px'))
    const text = el('span', 'flex:1;min-width:0')
    text.append(
      el('strong', 'font-weight:650', 'Proposed by Claude'),
      el('span', 'color:var(--text-meta)', ` · ${note}`)
    )
    bar.append(well, text, btn('Discard', 'btn'), btn(accept, 'btn btn-primary'))
    anchor.prepend(bar)
  }
  function notice(text) {
    const content = $('.content')
    const scope = [...content.attributes].find((a) => a.name.startsWith('data-v-'))
    const n = el('div', 'display:flex;align-items:center;gap:12px')
    n.className = 'notice'
    if (scope) n.setAttribute(scope.name, '')
    n.append(el('span', '', text), btn('Undo'))
    content.append(n)
  }
  function tagChip(parent, leaf, { suggested = false, color = '#18b46d' } = {}) {
    const edge = suggested ? `dashed ${RECV_EDGE}` : 'solid var(--line)'
    const c = el(
      'span',
      `display:inline-flex;align-items:center;height:var(--chip-h);padding:0 8px;border-radius:var(--radius-pill);border:1px ${edge};font-size:var(--font-sm);color:var(--text);gap:1px;margin-right:6px`
    )
    c.append(
      el('span', `width:7px;height:7px;border-radius:50%;background:${color};margin-right:5px`),
      el('span', 'color:var(--text-meta)', parent),
      el('span', 'font-weight:600', leaf)
    )
    if (suggested) c.append(el('span', 'color:var(--text-meta);margin-left:4px', '· suggested'))
    return c
  }
  function dropdown(anchor, rows, title) {
    const r = anchor.getBoundingClientRect()
    const d = el(
      'div',
      `position:fixed;left:${r.left}px;top:${r.bottom + 4}px;width:${Math.max(r.width, 260)}px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-2);padding:4px 0;z-index:50;font-size:var(--font-md);color:var(--text)`
    )
    if (title)
      d.append(el('div', 'padding:4px 10px;font-size:var(--font-xs);color:var(--text-meta)', title))
    rows.forEach(([parent, leaf, n], i) => {
      const o = el(
        'div',
        `height:28px;display:flex;align-items:center;gap:1px;padding:0 10px;background:${i === 0 ? 'var(--row-hover)' : 'transparent'}`
      )
      o.append(
        el('span', 'color:var(--text-meta)', parent),
        el('span', 'font-weight:600', leaf),
        el('span', 'flex:1'),
        el('span', 'font-size:var(--font-xs);color:var(--text-meta)', n)
      )
      d.append(o)
    })
    document.body.append(d)
  }
  // Only the tabs named survive, so state left by an earlier render cannot leak in.
  function keepTabs(names) {
    $$('.diff-tabs .tab').forEach((t) => {
      if (!t.classList.contains('active') && !names.includes($('.name', t)?.textContent.trim()))
        t.remove()
    })
  }

  window.dk = {
    $,
    $$,
    el,
    svg,
    btn,
    shown,
    ICON,
    RECV_EDGE,
    SELECTED,
    designFont,
    keepRowTemplate,
    row,
    tagHead,
    railPending,
    proposedTab,
    reviewBar,
    notice,
    tagChip,
    dropdown,
    keepTabs
  }
}
