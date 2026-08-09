// The clipboard half of the key swap: PEEK — read in main, validate, never
// store — so + Trusted key can offer a key copied out of any chat app. The
// renderer never supplies the text, and the same naming/confirm dialog gates
// this that gates a picked file: there is no silent-add path.
import { clipboard, ipcMain } from 'electron'
import { parseKeyText } from './keyText'
import { getIdentity, vouchedBy } from './share'
import { guardIdentity } from './shareCore'

export function registerKeyExchangeIpc() {
  ipcMain.handle(
    'share:peekClipboardKey',
    guardIdentity(async () => {
      let parsed
      try {
        parsed = parseKeyText(clipboard.readText())
      } catch {
        return { error: 'no-key' }
      }
      if (parsed.fp === (await getIdentity()).pub.fingerprint) return { error: 'own-key' }
      return {
        ok: true,
        key: parsed.key,
        fingerprint: parsed.fp,
        defaultLabel: parsed.defaultLabel,
        vouchedBy: await vouchedBy(parsed.key)
      }
    })
  )
}
