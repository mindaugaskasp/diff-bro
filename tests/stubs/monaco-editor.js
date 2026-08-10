// A feature slice's index.js is its whole surface, so a composable importing the
// slice pulls its components — and Monaco — into the module graph. Nothing under
// test runs an editor; this keeps the resolver from loading 2 MB of one.
export class Range {
  constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
    Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn })
  }
}

export const editor = {
  OverviewRulerLane: { Left: 1, Center: 2, Right: 4, Full: 7 },
  MouseTargetType: { GUTTER_GLYPH_MARGIN: 2 },
  create: () => ({ dispose: () => {} }),
  createDiffEditor: () => ({ dispose: () => {} }),
  colorizeElement: async () => {},
  defineTheme: () => {},
  setTheme: () => {},
  addKeybindingRules: () => {}
}
export const languages = { register: () => {}, setMonarchTokensProvider: () => {} }
export const KeyCode = {}
export const KeyMod = {}
export default { editor, languages, KeyCode, KeyMod, Range }
