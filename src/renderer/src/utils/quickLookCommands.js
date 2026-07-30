// Convert tools for the Quick Look launcher: pure text→text transforms that run
// IN the launcher (no main process, no raising the app), so a base64 string can
// be decoded without ever leaving what you're doing. Reuses the same pure
// helpers the in-app tools use, so the two never diverge.
import { TEXT_TOOLS } from './textTools'
import { toolById } from './tools'

const T = TEXT_TOOLS

// A `panel` tool renders its own rich body (ToolEpoch.vue) in the launcher
// instead of the text→text input/output; it has no `convert`.
export const CONVERT_TOOLS = [
  { id: 'base64', name: 'Base64', panel: 'base64' },
  { id: 'jwt', name: 'JWT Decode', panel: 'jwt' },
  { id: 'url', name: 'URL', panel: 'url' },
  { id: 'html', name: 'HTML Entities', convert: T.html.format },
  { id: 'epoch', name: 'Epoch / Date', panel: 'epoch' },
  { id: 'json', name: 'JSON', panel: 'json' },
  { id: 'uuid', name: 'UUID', panel: 'uuid' },
  { id: 'lines', name: 'Lines', panel: 'lines' }
]

const BY_ID = new Map(CONVERT_TOOLS.map((t) => [t.id, t]))

// The launcher ranks these next to snippets via rank(), which matches on `name`;
// kind:'command' routes a choice into convert mode instead of openInMain. `panel`
// travels so the convert panel knows to render a rich body, and the registry
// supplies the row's own icon and action word (never a blanket "convert").
export const convertItems = () =>
  CONVERT_TOOLS.map((t) => {
    const tool = toolById(t.id)
    return {
      kind: 'command',
      id: t.id,
      name: t.name,
      panel: t.panel,
      icon: tool?.icon ?? 'wrench',
      action: tool?.kind ?? 'Convert'
    }
  })

/**
 * @param {string} id     a CONVERT_TOOLS id
 * @param {string} input
 * @returns {{ output: string } | { error: string }}
 */
export function runConvert(id, input) {
  const tool = BY_ID.get(id)
  if (!tool) return { error: 'unknown-tool' }
  // Panel tools render their own UI; there's nothing to text-convert.
  if (tool.panel || !input) return { output: '' }
  try {
    return { output: tool.convert(input) }
  } catch {
    // base64Decode throws on malformed input; the others are total.
    return { error: 'convert-failed' }
  }
}
