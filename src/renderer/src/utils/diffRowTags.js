// What a saved-diff row leads with (the type monogram) and what it shows as tags.

/**
 * The row's type key: the recorded format.
 * @param {import('../types').VaultEntry} entry
 * @returns {string|null}
 */
export const rowFormatKey = (entry) => entry?.format || null

/**
 * Tags worth showing: the entry's own, minus the "imported" auto-tag (the
 * External section already says so).
 * @param {import('../types').VaultEntry} entry
 * @returns {string[]}
 */
export const rowTags = (entry) => (entry?.tags || []).filter((t) => t !== 'imported')
