// Vite worker wiring for Monaco. The editor worker is enough for the diff
// view; language workers add rich support for json/css/html/ts files.
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Disable the Command Palette (F1 / Ctrl+Shift+P) across every editor: the app
// never uses it and it exposes internal editor commands we don't want reachable
// in the packaged build. Unbinding globally is simpler and safer than doing it
// per editor. (contextmenu is also turned off where editors are created.)
monaco.editor.addKeybindingRules?.([
  { keybinding: monaco.KeyCode.F1, command: null },
  { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, command: null }
])

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}
