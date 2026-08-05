// The Security menu's items, lifted out of buildMenus, which is at its size cap.
// `run` is passed in so this stays a plain data builder with no store reach.
import { t } from './i18n'

/** @param {(action: string) => void} run */
export const securityItems = (run) => [
  { label: t('menu.security.sharePublicKey'), run: () => run('export-pubkey') },
  { sep: true },
  { label: t('menu.security.addTrustedKey'), run: () => run('add-trusted-key') },
  { label: t('menu.security.manageTrustedKeys'), run: () => run('manage-keys') },
  { label: t('menu.security.replaceKey'), run: () => run('rotate-key') },
  { sep: true },
  {
    label: t('menu.security.configuration'),
    items: [
      { label: t('menu.security.backUp'), run: () => run('config-backup') },
      { label: t('menu.security.restore'), run: () => run('config-restore') }
    ]
  }
]
