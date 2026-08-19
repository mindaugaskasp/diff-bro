import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { parseMarkdown } from '../utils/markdownRender'
import { parseJira } from '../utils/jiraRender'
import { serializeMarkdown } from '../utils/markdownSerialize'
import { serializeJira } from '../utils/jiraSerialize'
import { domToBlocks } from '../utils/domToBlocks'
import { applyDomFormat, isInListItem } from '../utils/domFormat'
import { caretOffset, restoreCaret } from '../utils/caret'

// The WYSIWYG loop for the rendered snippet views.
//
// While typing, the DOM is the source of truth. Re-rendering from the text it
// produces would replace every node under the caret, so the tree is refreshed
// only when `content` changes from OUTSIDE.

const DIALECTS = {
  markdown: { parse: parseMarkdown, serialize: serializeMarkdown },
  jira: { parse: parseJira, serialize: serializeJira }
}

const dialectOf = (name) => DIALECTS[name] ?? DIALECTS.markdown

function insertText(root, text) {
  const selection = root?.ownerDocument?.defaultView?.getSelection?.()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return
  range.deleteContents()
  const node = root.ownerDocument.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

// Module scope: these need only the element and a way to publish the result.
function editHandlers(root, emit) {
  // Rule 8: a native paste inserts the clipboard's text/html — attacker-authored
  // markup landing in the DOM behind Vue's back. Only text/plain is ever read.
  const onPaste = (event) => {
    event.preventDefault()
    const text = event.clipboardData?.getData('text/plain')
    if (!text) return
    insertText(root.value, text)
    emit()
  }

  // Tab is how you leave a dialog field, so it is only taken INSIDE a list.
  const onKeydown = (event) => {
    if (event.key !== 'Tab' || !isInListItem(root.value)) return
    event.preventDefault()
    if (applyDomFormat(root.value, event.shiftKey ? 'outdent' : 'indent')) emit()
  }

  // The toolbar edits the DOM here rather than the source text — see domFormat.
  const applyFormat = (id) => {
    if (applyDomFormat(root.value, id)) emit()
  }

  return { onPaste, onKeydown, applyFormat }
}

/**
 * @param {object} o
 * @param {import('vue').Ref<HTMLElement|null>} o.root     the contenteditable element
 * @param {import('vue').Ref<string>} o.content            two-way bound markup text
 * @param {import('vue').Ref<string>} o.dialect            'markdown' | 'jira'
 */
export function useContentEditable({ root, content, dialect }) {
  const blocks = shallowRef(dialectOf(dialect.value).parse(content.value))
  // What this composable last wrote; anything else came from outside.
  const ours = ref(content.value)
  // Typing leaves Vue's vdom stale, and patching from a stale tree corrupts it,
  // so this keys the subtree to REBUILD on an external change.
  const version = ref(0)

  const render = () => {
    blocks.value = dialectOf(dialect.value).parse(content.value)
    version.value++
  }

  function emit() {
    const text = dialectOf(dialect.value).serialize(domToBlocks(root.value))
    ours.value = text
    content.value = text
  }

  watch(content, (next) => {
    if (next === ours.value) return
    const at = caretOffset(root.value)
    render()
    nextTick(() => restoreCaret(root.value, at))
  })
  watch(dialect, render)

  return {
    blocks: computed(() => blocks.value),
    version: computed(() => version.value),
    onInput: emit,
    // A checkbox toggle mutates a PROPERTY, which fires `change` and never `input`.
    onToggleTask: emit,
    ...editHandlers(root, emit)
  }
}
