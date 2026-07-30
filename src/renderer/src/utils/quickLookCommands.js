// Tools offered by the Quick Look launcher. Every one renders its own rich
// panel IN the launcher (no main process, no raising the app), so a token can be
// decoded without leaving what you're doing. Names are the launcher's own search
// aliases ("Epoch / Date" finds it by typing "date"); the icon and action word
// come from the shared registry so the launcher and the app never diverge.
import { toolById } from './tools'

export const CONVERT_TOOLS = [
  { id: 'base64', name: 'Base64', panel: 'base64' },
  { id: 'jwt', name: 'JWT Decode', panel: 'jwt' },
  { id: 'url', name: 'URL', panel: 'url' },
  { id: 'epoch', name: 'Epoch / Date', panel: 'epoch' },
  { id: 'json', name: 'JSON', panel: 'json' },
  { id: 'uuid', name: 'UUID', panel: 'uuid' },
  { id: 'lines', name: 'Lines', panel: 'lines' }
]

// The launcher ranks these next to snippets via rank(), which matches on `name`;
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
