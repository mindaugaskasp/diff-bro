// Whether a comparison shows a status band under it. Lives here rather than in
// App.vue because it is a fact about the VIEW, and App is at its script cap —
// the floating shortcut bar has to clear the band or it covers the counts.

/**
 * @param {{ ready: boolean, comparableKind: string, stats: object|null,
 *           identical: boolean }} store
 * @returns {boolean}
 */
export const hasStatusBand = (store) =>
  !!store?.ready &&
  (store.comparableKind !== 'text' || (!!store.stats && !store.identical))
