import { t } from '../../i18n'
import { useSnippetStore } from '../../stores/snippetStore'
import { EXAMPLE_SNIPPET, EXAMPLE_SNIPPET_V2, EXAMPLE_TAG } from '../../utils/snippetExamples'

async function exampleId(snippets, { nameKey, ...example }) {
  const name = t(nameKey)
  const found = snippets.entries.find((e) => e.name === name && e.tags.includes(EXAMPLE_TAG))
  return found?.id ?? (await snippets.add({ ...example, name, marks: false }))
}

/**
 * The two diagrams the Diagrams tour compares, put back if they were deleted
 * or the profile predates v2. Null when the vault cannot take them.
 * @returns {Promise<{ example: string, v2: string }|null>}
 */
export async function ensureDiagramExamples() {
  const snippets = useSnippetStore()
  const v2 = await exampleId(snippets, EXAMPLE_SNIPPET_V2)
  const example = await exampleId(snippets, EXAMPLE_SNIPPET)
  return example && v2 ? { example, v2 } : null
}
