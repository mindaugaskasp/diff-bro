// The toolbar's document actions, as data. One source feeds the bar and the
// overflow menu, so a folded action can never say something different from its
// inline twin — which is the drift a second hand-written menu would guarantee.
//
// Pure, and exports KEY IDs: a t() here would run at module load and freeze
// whatever locale the app started in. The component translates.

import { STREAMED_LIMITS } from './streamedLimits'

/**
 * @typedef {object} ToolbarState
 * @property {boolean} isStreamed
 * @property {boolean} hasUnsavedWork
 * @property {boolean} canSave
 * @property {boolean} ready
 * @property {string}  comparableKind
 * @property {boolean} isSavedDiff
 * @property {boolean} canClear
 * @property {boolean} isPaste
 * @property {boolean} canExportImage
 * @property {boolean} isSpreadsheet
 */

/**
 * @typedef {object} ToolbarAction
 * @property {string}  id       also the commands.js id it runs
 * @property {string}  labelKey
 * @property {string}  tipKey
 * @property {string}  icon     icons.js name — every row has one, because the
 *   bar drops to icons before it folds anything away
 * @property {boolean} disabled
 * @property {boolean} [active] the control is IN the state it switches to, so
 *   the bar can show an on-state rather than an unlabelled press
 * @property {boolean} pinned   never folds into the overflow menu
 */

// Least important first — the order the bar sheds controls under pressure.
// Share is LAST and Save is not here at all: at the width where this fires, one
// click deeper is better than half off the screen, but the primary action stays
// where the hand expects it. Measured: with Share pinned too, the pinned set
// alone still overflowed by 18px at maximum zoom in en-XA with the sidebar at
// its cap — pinning something is a promise that it fits.
export const FOLD_ORDER = ['clear', 'export-image', 'copy-diff', 'toggle-paste', 'share-current']

const saveTipKey = (s) => {
  if (s.isStreamed) return STREAMED_LIMITS.save
  if (s.canSave && !s.hasUnsavedWork) return 'appToolbar.tips.alreadySaved'
  return 'appToolbar.tips.save'
}

const copyTipKey = (s) => {
  if (s.isStreamed) return STREAMED_LIMITS.copy
  if (s.comparableKind !== 'text') return 'appToolbar.tips.copyTextOnly'
  return 'appToolbar.tips.copy'
}

// A grid has no line selection to narrow the picture to, so its tip drops that
// half rather than promising something the viewer cannot do.
const captureTipKey = (s) => {
  if (!s.canExportImage) return 'appToolbar.tips.captureNeedsFiles'
  return s.isSpreadsheet ? 'appToolbar.tips.captureGrid' : 'appToolbar.tips.capture'
}

// Setting up a comparison, not viewing one: a vault-backed tab has nothing to
// switch the input mode OF, and offering it there invites a click that would
// replace what the reader opened. Same test Clear already uses.
const pasteRow = (s) => ({
  id: 'toggle-paste',
  labelKey: s.isPaste ? 'appToolbar.fileMode' : 'appToolbar.pasteMode',
  tipKey: s.isPaste ? 'appToolbar.tips.backToFiles' : 'appToolbar.tips.comparePasted',
  // The glyph names the destination, exactly as the label does.
  icon: s.isPaste ? 'file' : 'clipboard',
  disabled: false,
  // Paste mode is a mode, so the control that entered it stays lit.
  active: s.isPaste,
  pinned: false
})

const clearRow = (s) => ({
  id: 'clear',
  labelKey: 'appToolbar.clear',
  tipKey: s.isPaste ? 'appToolbar.tips.clearPaste' : 'appToolbar.tips.clearFiles',
  icon: 'x',
  disabled: !s.canClear,
  pinned: false
})

/**
 * @param {ToolbarState} s
 * @returns {ToolbarAction[]} in bar order, left to right
 */
export function toolbarActions(s) {
  const setup = !s.isSavedDiff
  return [
    ...(setup ? [pasteRow(s)] : []),
    {
      id: 'save',
      labelKey: 'common.save',
      tipKey: saveTipKey(s),
      icon: 'save',
      disabled: !s.hasUnsavedWork,
      pinned: true
    },
    {
      id: 'share-current',
      labelKey: 'appToolbar.share',
      tipKey: s.isStreamed ? STREAMED_LIMITS.share : 'appToolbar.tips.share',
      icon: 'share',
      disabled: !s.canSave,
      pinned: false
    },
    {
      id: 'copy-diff',
      labelKey: 'appToolbar.copyDiff',
      tipKey: copyTipKey(s),
      icon: 'copy',
      disabled: !s.ready || s.comparableKind !== 'text',
      pinned: false
    },
    {
      id: 'export-image',
      labelKey: 'appToolbar.capture',
      tipKey: captureTipKey(s),
      icon: 'image',
      disabled: !s.canExportImage,
      pinned: false
    },
    ...(setup ? [clearRow(s)] : [])
  ]
}
