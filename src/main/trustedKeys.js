// The trust store: trusted-keys.json and every handler that reads or writes it.
// Lifted out of share.js, which was at its size cap with nowhere left to put a
// handler — and this is one concern (who we trust, and how to reach them)
// rather than a slice of the sealing glue.
//
// An entry is { fingerprint, label, sign, box, email? }. The email is a local
// delivery hint the owner of this machine typed; it never travels in a
// .diffbrokey, so it is never attacker-supplied on import.
import { ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { dataFile } from './appData'
import { isValidEmail, normalizeEmail } from './mailAddress'

const trustPath = () => dataFile('trusted-keys.json')

/** @returns {Promise<object[]>} */
export async function readTrusted() {
  try {
    const list = JSON.parse(await readFile(trustPath(), 'utf-8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const writeTrusted = (list) => writeFile(trustPath(), JSON.stringify(list, null, 2))

/**
 * Replace the whole list — a config restore, and the only caller that may. The
 * list must already have been vetted (shareCore.validateRestoredConfig): this
 * writes what it is given.
 */
export const replaceTrusted = (list) => writeTrusted(list)

/**
 * Add or replace a trusted key, keeping any address already stored for it — a
 * re-import after a rotation must not silently drop the address.
 */
export async function storeTrusted(key, fp, label) {
  const before = await readTrusted()
  const previous = before.find((t) => t.fingerprint === fp)
  const entry = { fingerprint: fp, label: (label || fp).trim() || fp, sign: key.sign, box: key.box }
  if (previous?.email) entry.email = previous.email
  await writeTrusted([...before.filter((t) => t.fingerprint !== fp), entry])
}

/**
 * Addresses for the given fingerprints, in the order asked. Resolved HERE from
 * the trust store rather than accepted from the renderer, so a hand-off can only
 * ever reach someone already trusted.
 * @param {string[]} fingerprints
 * @returns {Promise<{ ok: true, to: object[] } | { error: string }>}
 */
export async function addressesFor(fingerprints) {
  const trusted = await readTrusted()
  const wanted = [...new Set(Array.isArray(fingerprints) ? fingerprints : [fingerprints])]
  if (!wanted.length) return { error: 'unknown-recipient' }
  const found = wanted.map((fp) => trusted.find((t) => t.fingerprint === fp))
  if (found.some((t) => !t)) return { error: 'unknown-recipient' }
  const missing = found.filter((t) => !isValidEmail(t.email))
  if (missing.length) return { error: 'no-address', who: missing.map((t) => t.label) }
  return { ok: true, to: found.map((t) => ({ label: t.label, email: t.email })) }
}

export function registerTrustedKeyIpc() {
  ipcMain.handle('share:listTrusted', async () =>
    (await readTrusted()).map(({ fingerprint, label, email }) => ({
      fingerprint,
      label,
      email: email ?? null
    }))
  )

  ipcMain.handle('share:renameTrusted', async (e, fp, label) => {
    const trusted = await readTrusted()
    const entry = trusted.find((t) => t.fingerprint === fp)
    if (!entry) return { error: 'unknown' }
    entry.label = (label || fp).trim() || fp
    await writeTrusted(trusted)
    return { ok: true, label: entry.label, fingerprint: fp }
  })

  // An empty string clears the address; anything malformed is refused before it
  // reaches disk, so a stored address can never carry a header separator.
  ipcMain.handle('share:setTrustedEmail', async (e, fp, email) => {
    const trusted = await readTrusted()
    const entry = trusted.find((t) => t.fingerprint === fp)
    if (!entry) return { error: 'unknown' }
    const next = normalizeEmail(email)
    if (next && !isValidEmail(next)) return { error: 'bad-email' }
    if (next) entry.email = next
    else delete entry.email
    await writeTrusted(trusted)
    return { ok: true, fingerprint: fp, email: next || null }
  })

  ipcMain.handle('share:removeTrusted', async (e, fp) => {
    const before = await readTrusted()
    const trusted = before.filter((t) => t.fingerprint !== fp)
    if (trusted.length === before.length) return { ok: false, error: 'unknown-recipient' }
    await writeTrusted(trusted)
    return { ok: true }
  })
}
