// Vite worker wiring for Monaco. The editor worker is enough for the diff
// view; language workers add rich support for json/css/html/ts files.
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { registerMermaidLanguage } from './monaco-mermaid'
import { registerJiraLanguage } from './monaco-jira'

// Mermaid and Jira/Confluence wiki markup have no built-in Monaco grammar;
// register ours so snippet code highlights (the 'mermaid' and 'jira' language
// ids come from utils/detectLanguage.js).
registerMermaidLanguage(monaco)
registerJiraLanguage(monaco)

// Disable the Command Palette (F1 / Ctrl+Shift+P) across every editor: the app
// never uses it and it exposes internal editor commands we don't want reachable
// in the packaged build. Unbinding globally is simpler and safer than doing it
// per editor. (contextmenu is also turned off where editors are created.)
// F7 is the merge view's next/previous conflict. Monaco binds the same pair to
// wordHighlight.next/prev and stops propagation when it wins, so the window
// listener never sees them once the caret is in the result pane.
monaco.editor.addKeybindingRules?.([
  { keybinding: monaco.KeyCode.F1, command: null },
  { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, command: null },
  { keybinding: monaco.KeyCode.F7, command: null },
  { keybinding: monaco.KeyMod.Shift | monaco.KeyCode.F7, command: null }
])

// Monaco's HTML worker builds document symbols by plain recursion with no depth
// guard (provideFileSymbolsInternal → children.forEach → itself), so an unclosed
// tag — which nests everything after it — overflows the stack and reaches the
// reader as a crash report over a file we should just have shown. Nothing here
// consumes symbols: there is no outline, no breadcrumbs, and the palette that
// would offer Go to Symbol is unbound above. setModeConfiguration REPLACES, so
// the rest of the features have to be carried across.
const htmlDefaults = monaco.languages.html?.htmlDefaults
htmlDefaults?.setModeConfiguration({
  ...htmlDefaults.modeConfiguration,
  documentSymbols: false
})

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}
