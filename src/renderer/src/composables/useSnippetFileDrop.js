import { useFileTextDrop } from './useFileDrop'
import { openedFileDraft } from '../utils/openedFileDraft'

/**
 * A file dropped on an open snippet opens beside it, never over it.
 * @param {{ openSnippet: (draft: object, title: string) => void }} tabs
 */
export function useSnippetFileDrop({ openSnippet }) {
  return useFileTextDrop((content, name, path) =>
    openSnippet(openedFileDraft({ content, name, path }), name)
  )
}
