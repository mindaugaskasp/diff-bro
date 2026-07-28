// Flatten the app menu tree (see menus.js buildMenus) into a flat command list
// the palette can search and run. Pure, so it's unit-tested without a store: a
// command is any leaf with a run(); separators and group headers are dropped,
// and a submenu label is folded into its leaves ("JSON · Format / Validate") so
// each command reads unambiguously on its own. The palette matches on `name`
// via the shared rank() (utils/quickLook.js), the same scorer the sidebar uses.

/**
 * @typedef {object} Command
 * @property {string} name   searchable label (matched by rank via .name)
 * @property {string} group  top-level menu the command lives under
 * @property {string} keys   accelerator label, '' when none
 * @property {() => void} run
 */

function walk(items, group, prefix, out) {
  for (const item of items || []) {
    if (item.sep || item.paletteHidden) continue
    const label = prefix ? `${prefix} · ${item.label}` : item.label
    if (Array.isArray(item.items)) {
      walk(item.items, group, label, out)
    } else if (typeof item.run === 'function') {
      out.push({ name: label, group, keys: item.keys || '', run: item.run })
    }
  }
}

/**
 * @param {Array<{ label: string, items: any[] }>} menus
 * @returns {Command[]}
 */
export function flattenCommands(menus) {
  const out = []
  for (const group of menus || []) walk(group.items, group.label, '', out)
  return out
}
