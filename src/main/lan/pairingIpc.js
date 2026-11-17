import { BrowserWindow, clipboard, ipcMain } from 'electron'
import { createPairing } from './pairing'
import { normalizeCode } from './pairingCode'
import { createRateLimit } from './rateLimit'
import { connectTo } from './server'
import { parseKeyText } from '../keyText'
import { encodePublicKey } from '../sealing'
import { checkedTrustedName, storeTrusted } from '../trustedKeys'

const FP = /^[0-9a-f]{32}$/
let pairing = null

const send = (channel, payload) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

async function labelFor(fp, name) {
  const plain = await checkedTrustedName(fp, name)
  if (plain.label) return plain.label
  return (await checkedTrustedName(fp, `${name} (${fp.slice(0, 4)})`)).label ?? fp
}

export function setUpPairing({ lan, identity, onTrustChanged }) {
  const limit = createRateLimit({ limit: 3, windowMs: 60_000 })
  const settings = () => lan.settings()
  pairing = createPairing({
    identity: {
      fp: identity.pub.fingerprint,
      keyText: encodePublicKey(identity.pub),
      name: () => settings().name
    },
    connect: (fp, handlers) => {
      const endpoint = lan.endpointOf(fp)
      return endpoint ? connectTo(endpoint, handlers) : Promise.reject(new Error('gone'))
    },
    parseKey: parseKeyText,
    storeKey: async (key, fp, name) => {
      await storeTrusted(key, fp, await labelFor(fp, name))
      onTrustChanged()
    },
    emit: (view) => send('lan:pairing', view),
    isVisible: () => settings().enabled && settings().visible,
    allowRequest: (remote) => limit.allow(remote, Date.now())
  })
  lan.on('add-request', pairing.onRequest)
  lan.on('add-reveal', pairing.onReveal)
  lan.on('add-result', pairing.onResult)
  lan.onClosed(pairing.onClosed)
  return pairing
}

export const cancelPairing = () => pairing?.cancelAll()

export function registerPairingIpc({ nameOf }) {
  ipcMain.handle('lan:add', (_e, fp) =>
    pairing && typeof fp === 'string' && FP.test(fp)
      ? pairing.add(fp, nameOf(fp))
      : { error: 'not-reachable' }
  )
  ipcMain.handle('lan:submitCode', (_e, id, code) =>
    pairing && typeof id === 'string' && typeof code === 'string'
      ? pairing.submitCode(id, code)
      : { error: 'no-request' }
  )
  ipcMain.handle('lan:cancel', (_e, id) =>
    pairing && typeof id === 'string' ? pairing.cancel(id) : { error: 'no-request' }
  )
  ipcMain.handle('lan:pasteCode', () => {
    const code = normalizeCode(clipboard.readText())
    return code ? { code } : { error: 'no-code' }
  })
}
