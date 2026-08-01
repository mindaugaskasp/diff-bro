// Names here are search aliases — "Epoch / Date" so typing "date" finds it;
// icon and action word come from the registry so the two surfaces agree.
import { toolById } from './tools'

export const CONVERT_TOOLS = [
  { id: 'base64', name: 'Base64', panel: 'base64' },
  { id: 'jwt', name: 'JWT Decode', panel: 'jwt' },
  { id: 'url', name: 'URL', panel: 'url' },
  { id: 'epoch', name: 'Epoch / Date', panel: 'epoch' },
  { id: 'json', name: 'JSON', panel: 'json' },
  { id: 'xml', name: 'XML', panel: 'xml' },
  { id: 'uuid', name: 'UUID', panel: 'uuid' },
  { id: 'lines', name: 'Lines', panel: 'lines' },
  { id: 'hash', name: 'Checksum', panel: 'hash' },
  { id: 'regex', name: 'Regex', panel: 'regex' }
]

// kind:'command' routes a choice into the panel instead of openInMain.
export const convertItems = () =>
  CONVERT_TOOLS.map((t) => {
    const tool = toolById(t.id)
    return {
      kind: 'command',
      id: t.id,
      name: t.name,
      panel: t.panel,
      icon: tool?.icon ?? 'wrench',
      action: tool?.kind ?? 'Open'
    }
  })
