// Sealing a saved diff and writing it where the user chooses. Lifted out of the
// share:export handler so the mail hand-off can reuse it — and so the sealed
// PATH stays inside the main process. The hand-off never gets a path back from
// the renderer to reveal or copy; it uses the one this returned.
import { dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { sealEntry, shareFilename, ttlError } from './sealing'
import { readTrusted } from './trustedKeys'

/**
 * Seal `entry` for the given fingerprints and write it. Returns the written path
 * and the resolved recipients, or an error code the renderer already knows how
 * to render.
 *
 * The identity is passed IN rather than loaded here: share.js owns it, and
 * importing it back would close a cycle check-structure.mjs is right to fail.
 * @param {{ entry: object, recipientFps: string[], identity: object }} args
 * @returns {Promise<{ ok: true, path: string, recipients: object[] } |
 *                   { canceled: true } | { error: string }>}
 */
export async function sealAndWrite({ entry, recipientFps, identity }) {
  const wanted = [...new Set(Array.isArray(recipientFps) ? recipientFps : [recipientFps])]
  const trusted = await readTrusted()
  const recipients = wanted.map((fp) => trusted.find((t) => t.fingerprint === fp))
  if (!recipients.length || recipients.some((r) => !r)) return { error: 'unknown-recipient' }

  // Enforce the TTL at signing too — never sign timestamps a receiver rejects.
  const invalid = ttlError(entry)
  if (invalid) return { error: invalid }

  const { priv, pub } = identity
  const file = sealEntry(entry, { priv, fingerprint: pub.fingerprint }, recipients)
  // Filename is forced (a ciphertext hash); the user only picks WHERE.
  const forcedName = shareFilename(file)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title:
      recipients.length > 1
        ? `Share diff (sealed for ${recipients.length} recipients)`
        : 'Share diff (sealed for one recipient)',
    defaultPath: forcedName,
    filters: [{ name: 'Diff Bro shared diff', extensions: ['diffbro'] }]
  })
  if (canceled || !filePath) return { canceled: true }

  const path = join(dirname(filePath), forcedName)
  await writeFile(path, JSON.stringify(file, null, 2))
  return { ok: true, path, recipients }
}
