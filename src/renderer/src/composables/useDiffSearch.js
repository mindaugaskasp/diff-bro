import { reactive } from 'vue'
import * as monaco from 'monaco-editor'
import { checkRegex } from '../utils/searchRegex'

// Whole-word bounds for Monaco's findMatches (null = match anywhere).
const WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?'

// The three search toggles, beside the state keys they drive. Their glyphs are
// the conventional editor shorthand and say nothing on their own, so each
// carries a tooltip that explains the behaviour rather than restating the label.
export const SEARCH_OPTIONS = [
  {
    key: 'matchCase',
    glyph: 'Aa',
    label: 'Match case',
    tip: 'Match case — “Error” stops matching “error”'
  },
  {
    key: 'wholeWord',
    glyph: 'W',
    label: 'Whole word',
    tip: 'Whole word — “id” stops matching inside “width”'
  },
  {
    key: 'isRegex',
    glyph: '.*',
    label: 'Regular expression',
    tip: 'Regular expression — search by pattern, e.g. ^\\s+$ (kept simple for safety)'
  }
]

// One independent search per pane (own query, options, navigation).
export function makeSearch(getModel, getSubEditor, getDecos) {
  const state = reactive({
    query: '',
    isRegex: false,
    matchCase: false,
    wholeWord: false,
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
    // Monaco's search is synchronous, so an unsafe regex would hang the renderer.
    if (state.isRegex && !checkRegex(state.query).ok) {
      state.error = true
      return clear()
    }
    try {
      // findMatches(search, searchScope, isRegex, matchCase, wordSeparators, captureMatches)
      matches = model
        .findMatches(
          state.query,
          false,
          state.isRegex,
          state.matchCase,
          state.wholeWord ? WORD_SEPARATORS : null,
          false
        )
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
