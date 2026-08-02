// The structure-aware comparable. Deliberately NOT in the auto-resolve registry:
// a JSON file is still a text file, and its line-by-line diff is often the one
// you want. This adapter is reached only when the reader turns Structure on
// (diffStore.semanticView), so the choice stays theirs.
import { parseStructured } from '../utils/structuralDiff'

export const structureAdapter = {
  id: 'structure',
  matches: (file, kind) => !!kind && typeof file?.content === 'string',
  /**
   * @param {{ content: string }} file
   * @param {'json'|'yaml'|'xml'} kind
   * @returns {{ kind: 'tree', value: unknown }|{ kind: 'tree', error: string }}
   */
  toComparable(file, kind) {
    const parsed = parseStructured(file.content, kind)
    return { kind: 'tree', ...parsed }
  }
}
