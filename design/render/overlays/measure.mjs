// Contrast of the redesign's new elements, read off the live DOM in the current theme.
export function measureRedesign() {
  const parse = (c) => {
    const srgb = c.match(/color\(srgb ([^)]+)\)/)
    if (srgb) {
      const [r, g, b, a = 1] = srgb[1].split(/[ /]+/).filter(Boolean).map(Number)
      return { r: r * 255, g: g * 255, b: b * 255, a }
    }
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const [r, g, b, a = 1] = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number)
    return { r, g, b, a }
  }
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1
  })
  const groundOf = (el) => {
    const stack = []
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0) {
        stack.push(c)
        if (c.a >= 1) break
      }
    }
    return stack.reverse().reduce((acc, c) => over(c, acc), { r: 255, g: 255, b: 255, a: 1 })
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
  }
  const visible = (sel) =>
    [...document.querySelectorAll(sel)].find(
      (e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0
    )
  const ink = (sel) => {
    const el = visible(sel)
    if (!el) return null
    const color = parse(getComputedStyle(el).color)
    if (!color) return null
    return ratio(over(color, groundOf(el)), groundOf(el))
  }
  const edge = (sel, prop) => {
    const el = visible(sel)
    if (!el) return null
    const c = parse(getComputedStyle(el)[prop])
    const ground = groundOf(el.parentElement)
    return c ? ratio(over(c, ground), ground) : null
  }
  const fill = (sel) => {
    const el = visible(sel)
    if (!el) return null
    return ratio(groundOf(el), groundOf(el.parentElement))
  }
  const token = (name, against) => {
    const probe = document.createElement('div')
    probe.style.cssText = `position:fixed;left:-99px;top:0;width:4px;height:4px;background:var(${name})`
    const host = visible(against) ?? document.body
    host.append(probe)
    const r = ratio(groundOf(probe), groundOf(host))
    probe.remove()
    return r
  }
  return {
    iconAction: ink('.diff-tabs .options .btn:not(.btn-primary)'),
    primaryLabel: ink('.btn-primary'),
    hoverFace: token('--btn-face-hover', '.diff-tabs'),
    segIcon: ink('.dk-seg button'),
    segSelected: fill('.dk-seg button.dk-on'),
    tagHeading: ink('.dk-taghead'),
    rowName: ink('.row .nm'),
    proposalKeyline: edge('.dk-proposal', 'outlineColor'),
    groupHeading: ink('.dk-grouphead'),
    footerSyntax: ink('.es-lang'),
    paneLabel: ink('.dk-pane-label'),
    toolLabel: ink('.tile .row-2-name'),
    selectedRow: fill('.dk-selected')
  }
}

// What each probe must reach: text 4.5, non-text (icons, edges) 3, a fill just distinguishable.
export const FLOORS = {
  iconAction: 3,
  primaryLabel: 4.5,
  hoverFace: 1.15,
  segIcon: 3,
  segSelected: 1.1,
  tagHeading: 4.5,
  rowName: 4.5,
  proposalKeyline: 3,
  groupHeading: 4.5,
  footerSyntax: 4.5,
  paneLabel: 4.5,
  toolLabel: 4.5,
  selectedRow: 1.1
}
