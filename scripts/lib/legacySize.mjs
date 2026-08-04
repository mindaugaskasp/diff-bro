// Size debt that predates the caps, one exact measurement per file: the entry
// permits what exists and not one line more, so an over-cap file cannot grow.
// Beat a cap and DELETE its entry — check-structure.mjs fails on a stale one.
// Never raise a number here; that turns the ratchet into permission.

/** @type {Record<string, {fn?: number, file?: number}>} */
export const LEGACY_SIZE = {
  'src/main/files.js': { fn: 84 },
  'src/main/hashDiff.js': { file: 335 },
  'src/main/lineIndexCore.js': { fn: 67 },
  'src/main/menu.js': { fn: 216, file: 313 },
  'src/main/quickLook.js': { file: 255 },
  'src/main/sealing.js': { file: 388 },
  'src/main/share.js': { fn: 267, file: 568 },
  'src/main/window.js': { fn: 74 },
  'src/renderer/src/composables/useMatrixRain.js': { fn: 96 },
  'src/renderer/src/composables/useMonacoInput.js': { fn: 96 },
  'src/renderer/src/composables/useQuickLook.js': { fn: 280, file: 297 },
  'src/renderer/src/composables/useQuickLookCompose.js': { fn: 66 },
  'src/renderer/src/composables/useQuickLookKeys.js': { fn: 105 },
  'src/renderer/src/composables/useSnippetDraft.js': { fn: 184 },
  'src/renderer/src/composables/useSnippetPreview.js': { fn: 94 },
  'src/renderer/src/composables/useSpreadsheetDiff.js': { fn: 73 },
  'src/renderer/src/composables/useStreamedDiff.js': { fn: 99 },
  'src/renderer/src/composables/useTabContextMenu.js': { fn: 70 },
  'src/renderer/src/composables/useTagInput.js': { fn: 84 },
  'src/renderer/src/menus.js': { fn: 190 },
  'src/renderer/src/monaco-mermaid.js': { fn: 94 },
  'src/renderer/src/stores/diffStore.js': { file: 787 },
  'src/renderer/src/stores/settingsStore.js': { file: 308 },
  'src/renderer/src/stores/snippetStore.js': { file: 584 },
  'src/renderer/src/stores/tabsStore.js': { file: 398 },
  'src/renderer/src/stores/vaultStore.js': { file: 433 },
  'src/renderer/src/utils/structuralDiff.js': { file: 300 },
  'src/renderer/src/utils/tabs.js': { file: 260 }
}

/** Files whose length is a declaration list, where a cap fires on adding a row. */
export const SIZE_EXEMPT = ['src/renderer/src/icons.js', 'src/renderer/src/types.js']

export const legacyConfigBlocks = () =>
  Object.entries(LEGACY_SIZE).map(([file, caps]) => ({
    files: [file],
    rules: {
      ...(caps.fn && {
        'max-lines-per-function': [
          'error',
          { max: caps.fn, skipBlankLines: false, skipComments: false }
        ]
      }),
      ...(caps.file && {
        'max-lines': ['error', { max: caps.file, skipBlankLines: false, skipComments: false }]
      })
    }
  }))
