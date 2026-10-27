import { languageForName } from '../adapters/textAdapter'
import { EXPLICIT_LANGUAGES } from '../../../shared/snippetLanguages'

const folderOf = (path) => String(path).replace(/[\\/][^\\/]*$/, '')

/**
 * The unsaved snippet a single opened file becomes.
 * @param {{ path: string, name: string, content: string }} file
 */
export function openedFileDraft(file) {
  const language = languageForName(file.name)
  return {
    id: null,
    initialName: file.name,
    initialContent: file.content,
    initialLanguage: EXPLICIT_LANGUAGES.includes(language) ? language : 'auto',
    initialTags: [],
    openedPath: file.path,
    openedFrom: folderOf(file.path)
  }
}
