// The Tools menu's items, lifted out of buildMenus, which is at its size cap.
// The Tools panel's job groups (utils/toolGroups.js), mirroring the native menu
// (src/main/menuSections.js) and sharing its catalogue keys.
import { MOD } from './keys'
import { t } from './i18n'

const tool = (run, key, action, keys) => ({
  label: t(key),
  ...(keys ? { keys } : {}),
  run: () => run(action)
})

/** @param {(action: string) => void} run */
export const toolsItems = (run) => [
  {
    label: t('menu.tools.encode'),
    items: [
      tool(run, 'menu.tools.base64', 'tools-base64', `${MOD}+Shift+B`),
      tool(run, 'menu.tools.url', 'tools-url')
    ]
  },
  {
    label: t('menu.tools.format'),
    items: [
      tool(run, 'menu.tools.json', 'tools-json', `${MOD}+Shift+J`),
      tool(run, 'menu.tools.xml', 'tools-xml', `${MOD}+Shift+M`),
      tool(run, 'menu.tools.lines', 'tools-lines', `${MOD}+Shift+R`)
    ]
  },
  {
    label: t('menu.tools.generate'),
    items: [
      tool(run, 'menu.tools.uuid', 'tools-uuid', `${MOD}+Shift+U`),
      tool(run, 'menu.tools.epoch', 'tools-epoch'),
      tool(run, 'menu.tools.checksum', 'tools-hash')
    ]
  },
  {
    label: t('menu.tools.inspect'),
    items: [tool(run, 'menu.tools.jwt', 'tools-jwt'), tool(run, 'menu.tools.regex', 'tools-regex')]
  },
  {
    label: t('menu.tools.secure'),
    items: [tool(run, 'menu.tools.encryptDecrypt', 'tools-crypt', `${MOD}+Shift+X`)]
  }
]
