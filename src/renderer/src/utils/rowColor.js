// The colours a snippet row can be painted with. A NAME is what gets stored, not
// a hex: the palette can be retuned without migrating a library, and a stored
// value that is not one of these six is simply not a colour.
//
// Six, not twenty: at row scale the wash carries hue weakly (six washes land
// within 0.01 ΔE of each other on a light ground — the 3px edge is what makes
// them nameable), and a picker offering a distinction the eye cannot make wastes
// the reader's time. These six are drawn from TAG_PALETTE, spread around the hue
// circle so no two are ever mistaken for each other.
//
// The row never paints the hex. It resolves to the theme's own lightness first
// (`oklch(from var(--snip-color) var(--tag-l) c h)`, the normalisation tags
// already use) and is then mixed into the panel — see SnippetRow.css.

/** @type {ReadonlyArray<{id: string, hex: string, labelKey: string}>} */
export const ROW_COLORS = [
  { id: 'rose', hex: '#e9687e', labelKey: 'rowColor.rose' },
  { id: 'amber', hex: '#d68200', labelKey: 'rowColor.amber' },
  { id: 'green', hex: '#18b46d', labelKey: 'rowColor.green' },
  { id: 'teal', hex: '#00afab', labelKey: 'rowColor.teal' },
  { id: 'blue', hex: '#299ff4', labelKey: 'rowColor.blue' },
  { id: 'violet', hex: '#a87eeb', labelKey: 'rowColor.violet' }
]

const BY_ID = new Map(ROW_COLORS.map((c) => [c.id, c]))

/**
 * The stored value, or null for "no colour". Anything else — a hand-edited
 * library, a name retired from the palette, an inherited key — is no colour.
 * @param {unknown} id
 * @returns {string|null}
 */
export const rowColorId = (id) => (typeof id === 'string' && BY_ID.has(id) ? id : null)

/**
 * What the row paints with, or null when it has no colour.
 * @param {unknown} id
 * @returns {string|null} a hex from the palette
 */
export const rowColorHex = (id) => BY_ID.get(rowColorId(id))?.hex ?? null
