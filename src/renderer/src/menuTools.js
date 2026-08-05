// The Tools menu's items, lifted out of buildMenus, which is at its size cap.
// Grouped by format to mirror the native menu (src/main/menuSections.js), and
// sharing its catalogue keys so the two cannot drift apart.
import { MOD } from './keys'
import { t } from './i18n'

/** @param {(action: string) => void} run */
export const toolsItems = (run) => [
  {
    label: t('menu.tools.base64'),
    keys: `${MOD}+Shift+B`,
    run: () => run('tools-base64')
  },
  { label: t('menu.tools.json'), keys: `${MOD}+Shift+J`, run: () => run('tools-json') },
  { label: t('menu.tools.xml'), keys: `${MOD}+Shift+M`, run: () => run('tools-xml') },
  { label: t('menu.tools.uuid'), keys: `${MOD}+Shift+U`, run: () => run('tools-uuid') },
  { label: t('menu.tools.jwt'), run: () => run('tools-jwt') },
  { label: t('menu.tools.epoch'), run: () => run('tools-epoch') },
  { label: t('menu.tools.url'), run: () => run('tools-url') },
  {
    label: t('menu.tools.checksum'),
    run: () => run('tools-hash')
  },
  {
    label: t('menu.tools.regex'),
    run: () => run('tools-regex')
  },
  {
    label: t('menu.tools.lines'),
    keys: `${MOD}+Shift+R`,
    run: () => run('tools-lines')
  },
  {
    label: t('menu.tools.textEncryption'),
    items: [
      {
        label: t('menu.tools.encryptDecrypt'),
        keys: `${MOD}+Shift+X`,
        run: () => run('tools-crypt')
      }
    ]
  }
]
