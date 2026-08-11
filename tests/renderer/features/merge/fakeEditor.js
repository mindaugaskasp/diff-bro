import { vi } from 'vitest'

/**
 * An editor small enough to reason about and real enough to catch the bugs that
 * matter: decoration ranges that move with the text, and edits that land on
 * whole lines. Shared by the ops and composable tests so both drive one model.
 */
export function fakeEditor(text = '') {
  let lines = text.length ? text.split('\n') : ['']
  const ranges = new Map()
  const handlers = {}
  let next = 0
  const model = {
    getEOL: () => '\n',
    getLineCount: () => lines.length,
    getLineMaxColumn: (n) => (lines[n - 1] ?? '').length + 1,
    getDecorationRange: (id) => ranges.get(id) ?? null,
    getValueInRange: (r) => lines.slice(r.startLineNumber - 1, r.endLineNumber).join('\n')
  }
  const on = (name) => (cb) => (handlers[name] = cb)
  return {
    getModel: () => model,
    getValue: () => lines.join('\n'),
    setValue: (v) => (lines = v.split('\n')),
    deltaDecorations: (old, added) => {
      old.forEach((id) => ranges.delete(id))
      return added.map((d) => {
        const id = `d${next++}`
        ranges.set(id, d.range)
        return id
      })
    },
    executeEdits: vi.fn((_, [edit]) => {
      const before = lines.slice(0, edit.range.startLineNumber - 1)
      const after = lines.slice(edit.range.endLineNumber - (edit.range.endColumn === 1 ? 1 : 0))
      const written = edit.text ? edit.text.replace(/\n$/, '').split('\n') : []
      lines = [...before, ...written, ...after]
    }),
    onDidScrollChange: on('scroll'),
    onMouseDown: on('mouse'),
    onDidChangeModelContent: on('change'),
    // 20px lines and a fixed viewport, so the take buttons' arithmetic has
    // something to land on. `top` is writable: a test scrolls by setting it.
    getTopForLineNumber: (line) => (line - 1) * 20,
    getLayoutInfo: () => ({ height: 400 }),
    top: 0,
    getScrollTop() {
      return this.top
    },
    setScrollTop: vi.fn(),
    revealLineInCenter: vi.fn(),
    setPosition: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
    fire: (name, arg) => handlers[name]?.(arg),
    __lines: () => lines
  }
}
