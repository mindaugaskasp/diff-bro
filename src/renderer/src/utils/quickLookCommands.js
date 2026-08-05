// Names here are search ALIASES — deliberately wordier than the registry label
// ("Epoch / Date" so typing "date" finds it); icon and action word come from the
// registry so the two surfaces agree. Keys, not text: utils/ is pure.
import { toolById } from './tools'

export const CONVERT_TOOLS = [
  { id: 'base64', nameKey: 'tools.alias.base64', panel: 'base64' },
  { id: 'jwt', nameKey: 'tools.alias.jwt', panel: 'jwt' },
  { id: 'url', nameKey: 'tools.alias.url', panel: 'url' },
  { id: 'epoch', nameKey: 'tools.alias.epoch', panel: 'epoch' },
  { id: 'json', nameKey: 'tools.alias.json', panel: 'json' },
  { id: 'xml', nameKey: 'tools.alias.xml', panel: 'xml' },
  { id: 'uuid', nameKey: 'tools.alias.uuid', panel: 'uuid' },
  { id: 'lines', nameKey: 'tools.alias.lines', panel: 'lines' },
  { id: 'hash', nameKey: 'tools.alias.hash', panel: 'hash' },
  { id: 'regex', nameKey: 'tools.alias.regex', panel: 'regex' }
]

// kind:'command' routes a choice into the panel instead of openInMain.
/**
 * @param {(key: string) => string} translate passed in — utils/ may not use Vue
 * @returns {object[]} rows rank() can search: `name` is the resolved alias
 */
export const convertItems = (translate) =>
  CONVERT_TOOLS.map((t) => {
    const tool = toolById(t.id)
    return {
      kind: 'command',
      id: t.id,
      name: translate(t.nameKey),
      panel: t.panel,
      icon: tool?.icon ?? 'wrench',
      action: translate(tool?.kindKey ?? 'tools.openAction')
    }
  })
