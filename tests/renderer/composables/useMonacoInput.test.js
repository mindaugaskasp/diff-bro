import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const created = []

function fakeModel() {
  const model = {
    value: '',
    language: '',
    options: { tabSize: 4, insertSpaces: true },
    getValue: () => model.value,
    detectIndentation(insertSpaces, tabSize) {
      const twoSpaced = /^ {2}\S/m.test(model.value)
      model.options = twoSpaced ? { insertSpaces: true, tabSize: 2 } : { insertSpaces, tabSize }
    },
    getOptions: () => model.options
  }
  return model
}

function fakeEditor(value) {
  const model = fakeModel()
  model.value = value
  const listeners = { content: [], paste: [] }
  const emitContent = (event) => listeners.content.forEach((fn) => fn(event))
  return {
    model,
    getModel: () => model,
    getValue: () => model.value,
    setValue(next) {
      model.value = next
      emitContent({ isFlush: true })
    },
    paste(text) {
      model.value += text
      emitContent({ isFlush: false })
      listeners.paste.forEach((fn) => fn({}))
    },
    type(text) {
      model.value += text
      emitContent({ isFlush: false })
    },
    addCommand: vi.fn(),
    onDidChangeCursorPosition: vi.fn(),
    onDidChangeModelContent: (fn) => listeners.content.push(fn),
    onDidPaste: (fn) => listeners.paste.push(fn),
    updateOptions: vi.fn(),
    dispose: vi.fn()
  }
}

vi.mock('monaco-editor', () => ({
  editor: {
    create: (el, opts) => {
      const editor = fakeEditor(opts.value)
      created.push(editor)
      return editor
    },
    setModelLanguage: (model, language) => (model.language = language)
  },
  KeyMod: { CtrlCmd: 1 },
  KeyCode: { KeyF: 2 }
}))
vi.mock('../../../src/renderer/src/composables/useEditorText', () => ({
  useEditorText: () => ({ attach: vi.fn() })
}))
vi.mock('../../../src/renderer/src/composables/useMonacoTheme', () => ({
  MONACO_THEME: 'diffbro',
  applyMonacoTheme: vi.fn()
}))

const { useMonacoInput } = await import('../../../src/renderer/src/composables/useMonacoInput')

let unmount = () => {}
function mountInput({ content = '', language = 'python' } = {}) {
  setActivePinia(createPinia())
  const refs = { content: ref(content), language: ref(language), container: ref(null) }
  const app = createApp({
    setup() {
      useMonacoInput(refs)
      return () => h('div')
    }
  })
  const el = document.createElement('div')
  document.body.append(el)
  refs.container.value = el
  app.mount(el)
  unmount = () => {
    app.unmount()
    el.remove()
  }
  return { ...refs, editor: created.at(-1) }
}

afterEach(() => {
  unmount()
  created.length = 0
})

const TWO_SPACED = 'if a:\n  b = 1\n  c = 2\nif d:'

describe('useMonacoInput indentation', () => {
  it('takes the indent of code pasted after its language was picked', () => {
    const { editor } = mountInput()
    expect(editor.model.getOptions().tabSize).toBe(4)
    editor.paste(TWO_SPACED)
    expect(editor.model.getOptions()).toEqual({ insertSpaces: true, tabSize: 2 })
  })

  it('takes the indent of content that arrives after the editor opened', async () => {
    const { editor, content } = mountInput()
    content.value = TWO_SPACED
    await nextTick()
    expect(editor.model.getOptions().tabSize).toBe(2)
  })

  it('keeps the language indent while code is typed', () => {
    const { editor } = mountInput()
    editor.type('if a:\n  b')
    expect(editor.model.getOptions().tabSize).toBe(4)
  })

  it('detects again when the language changes', async () => {
    const { editor, language } = mountInput({ language: 'plaintext' })
    language.value = 'yaml'
    await nextTick()
    expect(editor.model.language).toBe('yaml')
    expect(editor.model.getOptions().tabSize).toBe(2)
  })
})
