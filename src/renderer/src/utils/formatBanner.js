// Merge the two per-side format hints into one banner. Pure — the translator is
// passed in, because utils/ may not import Vue and a string resolved here at
// module load would freeze the locale the app started in.

const kindLabel = (h) => (h.kind === 'json' ? 'JSON' : 'XML')

/**
 * @param {object|null} left  per-side hint from detectFormat
 * @param {object|null} right
 * @param {(key: string, args?: object|number) => string} t
 * @returns {object|null} banner model, or null when neither side has a hint
 */
export function mergeFormatBanner(left, right, t) {
  const shown = []
  if (left) shown.push({ side: 'left', labelKey: 'common.left', hint: left })
  if (right) shown.push({ side: 'right', labelKey: 'common.right', hint: right })
  if (!shown.length) return null

  const clause = ({ labelKey, hint }) =>
    hint.valid
      ? t('formatBanner.looksLike', { side: t(labelKey), kind: kindLabel(hint) })
      : t('formatBanner.doesNotParse', {
          side: t(labelKey),
          kind: kindLabel(hint),
          where: hint.line ? t('formatBanner.atLine', { line: hint.line, col: hint.column }) : '',
          why: hint.error ? `: ${hint.error}` : ''
        })

  const valid = shown.filter((x) => x.hint.valid)
  const message =
    valid.length === 2
      ? left.kind === right.kind
        ? t('diffNotices.bothSidesLookLike', { kind: kindLabel(left) })
        : t('diffNotices.bothSidesLookLikeStructured')
      : shown.map(clause).join(' · ')

  return {
    message,
    invalid: valid.length === 0, // red only when nothing here is actionable
    formatBoth: valid.length === 2,
    formatSide: valid.length === 1 ? valid[0].side : null,
    formatLabel:
      valid.length === 1 && shown.length === 2
        ? t('formatBanner.formatSide', { side: t(valid[0].labelKey) })
        : t('formatBanner.format'),
    dismissSides: shown.map((x) => x.side)
  }
}
