import { reactive } from 'vue'
import * as monaco from 'monaco-editor'

// Each side searches only its own model, with its own query, match count, and
// navigation — the left and right panes are independent.
export function makeSearch(getModel, getSubEditor, getDecos) {
  const state = reactive({
    query: '',
    isRegex: false,
    matchCount: 0,
    currentIndex: 0,
    error: false
  })
  let matches = []

  function clear() {
    matches = []
    state.matchCount = 0
    state.currentIndex = 0
    getDecos()?.set([])
  }
  function apply() {
    getDecos()?.set(
      matches.map((range, i) => ({
        range,
        options: {
          className: i === state.currentIndex - 1 ? 'dv-find-current' : 'dv-find-match',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      }))
    )
  }
  function reveal(idx) {
    const range = matches[idx]
    if (range) getSubEditor()?.revealRangeInCenterIfOutsideViewport(range)
  }
  function run() {
    state.error = false
    const model = getModel()
    if (!state.query || !model) return clear()
    try {
      // findMatches(search, searchScope, isRegex, matchCase, wordSeparators, captureMatches)
      matches = model
        .findMatches(state.query, false, state.isRegex, false, null, false)
        .map((m) => m.range)
    } catch {
      state.error = true
      matches = []
    }
    state.matchCount = matches.length
    state.currentIndex = matches.length ? 1 : 0
    apply()
    if (matches.length) reveal(0)
  }
  function step(delta) {
    if (!state.matchCount) return
    state.currentIndex =
      ((state.currentIndex - 1 + delta + state.matchCount) % state.matchCount) + 1
    apply()
    reveal(state.currentIndex - 1)
  }
  return Object.assign(state, { run, step })
}
