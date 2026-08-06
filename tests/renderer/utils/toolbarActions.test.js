import { describe, expect, it } from 'vitest'
import { FOLD_ORDER, toolbarActions } from '../../../src/renderer/src/utils/toolbarActions'
import { COMMANDS } from '../../../src/renderer/src/utils/commands'
import { STREAMED_LIMITS } from '../../../src/renderer/src/utils/streamedLimits'

// A loaded, unsaved text comparison in file mode — the state the bar spends most
// of its life in. Each test names only what it changes.
const base = {
  isStreamed: false,
  hasUnsavedWork: true,
  canSave: true,
  ready: true,
  comparableKind: 'text',
  isSavedDiff: false,
  canClear: true,
  isPaste: false,
  canExportImage: true,
  isSpreadsheet: false
}
const rows = (over = {}) => toolbarActions({ ...base, ...over })
const byId = (over = {}) => Object.fromEntries(rows(over).map((r) => [r.id, r]))

describe('toolbarActions', () => {
  it('gives every row an id the command registry can actually run', () => {
    // The whole point of the rows carrying command ids: a typo here is a button
    // that silently does nothing, and only this assertion would catch it.
    expect(
      rows()
        .map((r) => r.id)
        .filter((id) => !COMMANDS[id])
    ).toEqual([])
  })

  it('folds in the documented order, and only ids it produces', () => {
    const ids = rows().map((r) => r.id)
    expect(FOLD_ORDER.filter((id) => !ids.includes(id))).toEqual([])
    expect(FOLD_ORDER).toEqual([
      'clear',
      'export-image',
      'copy-diff',
      'toggle-paste',
      'share-current'
    ])
  })

  // Pinning is a promise that the control fits. Share was pinned first and the
  // pinned set still overflowed by 18px at maximum zoom in en-XA with the
  // sidebar at its cap, so only the primary action keeps its place.
  it('pins Save alone, and folds Share last of all', () => {
    expect(
      rows()
        .filter((r) => r.pinned)
        .map((r) => r.id)
    ).toEqual(['save'])
    expect(FOLD_ORDER.at(-1)).toBe('share-current')
  })

  it('never offers a pinned row to the fold order', () => {
    const pinned = rows()
      .filter((r) => r.pinned)
      .map((r) => r.id)
    expect(FOLD_ORDER.filter((id) => pinned.includes(id))).toEqual([])
  })

  it('drops Paste mode and Clear on a saved diff rather than disabling them', () => {
    const ids = rows({ isSavedDiff: true }).map((r) => r.id)
    expect(ids).not.toContain('toggle-paste')
    expect(ids).not.toContain('clear')
    expect(ids).toContain('save')
  })

  // The bar drops to icons before it folds anything, so a row with no glyph
  // would vanish at that rung instead of getting terser.
  it('gives every row an icon, because the compact rung has nothing else to draw', () => {
    for (const row of rows()) expect(row.icon, row.id).toBeTruthy()
    for (const row of rows({ isPaste: true, isSavedDiff: false }))
      expect(row.icon, row.id).toBeTruthy()
  })

  // The binding existed with no rule behind it for a long time, and then the
  // rule outlived the binding when the actions moved into their own component.
  it('lights the paste toggle only while paste mode is the mode', () => {
    expect(byId({ isPaste: true })['toggle-paste'].active).toBe(true)
    expect(byId({ isPaste: false })['toggle-paste'].active).toBe(false)
  })

  it('names the destination the paste toggle goes TO, not where it is', () => {
    expect(byId({ isPaste: false })['toggle-paste'].labelKey).toBe('appToolbar.pasteMode')
    expect(byId({ isPaste: true })['toggle-paste'].labelKey).toBe('appToolbar.fileMode')
    // The glyph names the same destination the word does.
    expect(byId({ isPaste: false })['toggle-paste'].icon).toBe('clipboard')
    expect(byId({ isPaste: true })['toggle-paste'].icon).toBe('file')
  })

  describe('a disabled control says why', () => {
    it('blames the streamed comparison before anything else', () => {
      const s = byId({ isStreamed: true, comparableKind: 'streamed', ready: true })
      expect(s.save.tipKey).toBe(STREAMED_LIMITS.save)
      expect(s['share-current'].tipKey).toBe(STREAMED_LIMITS.share)
      expect(s['copy-diff'].tipKey).toBe(STREAMED_LIMITS.copy)
    })

    it('distinguishes "nothing to save" from "already saved"', () => {
      expect(byId({ hasUnsavedWork: true }).save.tipKey).toBe('appToolbar.tips.save')
      expect(byId({ hasUnsavedWork: false, canSave: true }).save.tipKey).toBe(
        'appToolbar.tips.alreadySaved'
      )
    })

    it('says copy is text-only rather than going quiet', () => {
      const copy = byId({ comparableKind: 'spreadsheet' })['copy-diff']
      expect(copy.disabled).toBe(true)
      expect(copy.tipKey).toBe('appToolbar.tips.copyTextOnly')
    })

    it('drops the line-selection half of the capture tip on a grid', () => {
      expect(byId({ isSpreadsheet: true })['export-image'].tipKey).toBe(
        'appToolbar.tips.captureGrid'
      )
      expect(byId({ isSpreadsheet: false })['export-image'].tipKey).toBe('appToolbar.tips.capture')
      expect(byId({ canExportImage: false })['export-image'].tipKey).toBe(
        'appToolbar.tips.captureNeedsFiles'
      )
    })

    it('says which thing Clear would throw away', () => {
      expect(byId({ isPaste: true }).clear.tipKey).toBe('appToolbar.tips.clearPaste')
      expect(byId({ isPaste: false }).clear.tipKey).toBe('appToolbar.tips.clearFiles')
    })
  })

  describe('disabled flags', () => {
    it('disables Save with no unsaved work and Share with nothing to share', () => {
      expect(byId({ hasUnsavedWork: false }).save.disabled).toBe(true)
      expect(byId({ canSave: false })['share-current'].disabled).toBe(true)
    })

    it('disables Copy unless a text comparison is ready', () => {
      expect(byId({ ready: false })['copy-diff'].disabled).toBe(true)
      expect(byId({ comparableKind: 'diagram' })['copy-diff'].disabled).toBe(true)
      expect(byId()['copy-diff'].disabled).toBe(false)
    })

    it('leaves the paste toggle enabled — it is always a way somewhere', () => {
      expect(byId({ ready: false, canClear: false })['toggle-paste'].disabled).toBe(false)
    })
  })
})
