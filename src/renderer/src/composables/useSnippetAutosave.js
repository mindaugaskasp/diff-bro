import { onScopeDispose } from 'vue'

export const AUTOSAVE_MS = 5000

/**
 * Saves a library snippet's edits every interval; a new draft is never saved for the user.
 * @param {object} o
 * @param {import('vue').Ref<boolean>} o.isNew
 * @param {import('vue').Ref<boolean>} o.isDirty
 * @param {import('vue').Ref<boolean>} o.editMode
 * @param {import('vue').Ref<boolean>} o.canSave
 * @param {() => void} o.save
 */
export function useSnippetAutosave({ isNew, isDirty, editMode, canSave, save }) {
  const timer = setInterval(() => {
    if (!isNew.value && isDirty.value && editMode.value && canSave.value) save()
  }, AUTOSAVE_MS)
  onScopeDispose(() => clearInterval(timer))
}
