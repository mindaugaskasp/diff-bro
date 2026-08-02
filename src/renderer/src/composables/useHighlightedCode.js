// The Monaco half of the snippet preview's highlighting: make sure the language
// is loaded, tokenize, and hand the pure mapper the result. Kept out of
// utils/highlight.js so that stays testable without Monaco.
import { computed, shallowRef, watchEffect } from 'vue'
import * as monaco from 'monaco-editor'
import { spansFor } from '../utils/highlight'

// Monaco loads a language the first time something asks for it. `colorize` is
// enough for the Monarch grammars, but JSON's tokenizer only registers once a
// MODEL of that language has existed — measured, not assumed. Creating and
// disposing one costs no DOM and is done once per language.
const warmed = new Set()
function warm(languageId) {
  if (warmed.has(languageId)) return
  warmed.add(languageId)
  try {
    monaco.editor.createModel('', languageId).dispose()
  } catch {
    // An unknown id just stays plain.
  }
}

// Warming only STARTS the load — monaco registers a grammar asynchronously and
// says nothing when it lands, so the first tokenize of a cold language comes
// back untyped and the preview rendered plain until a second hover.
const RETRY_MS = [0, 30, 90, 200, 400]

const plain = (text) =>
  String(text ?? '')
    .split('\n')
    .map((line) => [{ text: line, role: '' }])

// `typed` is false while the grammar is still loading — every token comes back
// with an empty type, which is also what a language with no grammar gives.
function tokenizeLines(body, lang) {
  let tokens = null
  try {
    tokens = monaco.editor.tokenize(body, lang)
  } catch {
    return { lines: plain(body), typed: false }
  }
  if (!tokens) return { lines: plain(body), typed: false }
  return {
    lines: body.split('\n').map((line, i) => spansFor(line, tokens[i])),
    typed: tokens.some((line) => line?.some((t) => t.type !== ''))
  }
}

/**
 * @param {() => string} text
 * @param {() => string} language  a Monaco language id, '' for none
 * @returns {{ lines: import('vue').Ref<{text: string, role: string}[][]> }}
 */
export function useHighlightedCode(text, language) {
  const lines = shallowRef([])
  const source = computed(() => String(text() ?? ''))

  watchEffect((onCleanup) => {
    const lang = language()
    const body = source.value
    let timer = null
    let stopped = false
    onCleanup(() => {
      stopped = true
      clearTimeout(timer)
    })
    if (!lang || lang === 'plaintext') {
      lines.value = plain(body)
      return
    }
    warm(lang)
    const attempt = (i) => {
      if (stopped) return
      const { lines: painted, typed } = tokenizeLines(body, lang)
      lines.value = painted
      if (!typed && i < RETRY_MS.length) timer = setTimeout(() => attempt(i + 1), RETRY_MS[i])
    }
    attempt(0)
  })

  return { lines }
}
