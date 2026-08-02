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

const plain = (text) =>
  String(text ?? '')
    .split('\n')
    .map((line) => [{ text: line, role: '' }])

/**
 * @param {() => string} text
 * @param {() => string} language  a Monaco language id, '' for none
 * @returns {{ lines: import('vue').Ref<{text: string, role: string}[][]> }}
 */
export function useHighlightedCode(text, language) {
  const lines = shallowRef([])
  const source = computed(() => String(text() ?? ''))

  watchEffect(() => {
    const lang = language()
    const body = source.value
    if (!lang || lang === 'plaintext') {
      lines.value = plain(body)
      return
    }
    warm(lang)
    let tokens = null
    try {
      tokens = monaco.editor.tokenize(body, lang)
    } catch {
      tokens = null
    }
    lines.value = tokens
      ? body.split('\n').map((line, i) => spansFor(line, tokens[i]))
      : plain(body)
  })

  return { lines }
}
