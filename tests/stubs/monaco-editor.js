// A feature slice's index.js is its whole surface, so a composable importing the
// slice pulls its components — and Monaco — into the module graph. Nothing under
// test runs an editor; this keeps the resolver from loading 2 MB of one.
export const editor = {
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
export default { editor, languages, KeyCode, KeyMod }
