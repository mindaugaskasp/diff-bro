import { getCurrentInstance, onBeforeUnmount } from 'vue'
import { findKeyAction } from '../utils/findKeys'

// On the window, not the snippet: after Edit, focus sits on <body>, outside it.
/**
 * @param {object} args
 * @param {import('vue').Ref<HTMLElement|null>} args.root  the snippet document
 * @param {import('vue').Ref<boolean>} args.editing
 * @param {(withReplace: boolean) => void} args.openFind
 * @param {boolean} [args.isMac]
 * @returns {() => void} stop
 */
export function useSnippetFindKeys({
  root,
  editing,
  openFind,
  isMac = navigator.platform.startsWith('Mac')
}) {
  function onKeydown(e) {
    const action = findKeyAction(e, { isMac })
    if (!action || !root.value?.offsetParent) return
    if (e.target?.closest?.('.monaco-editor, [role="dialog"], [role="alertdialog"]')) return
    e.preventDefault()
    openFind(action === 'replace' || editing.value)
  }
  window.addEventListener('keydown', onKeydown)
  const stop = () => window.removeEventListener('keydown', onKeydown)
  if (getCurrentInstance()) onBeforeUnmount(stop)
  return stop
}
