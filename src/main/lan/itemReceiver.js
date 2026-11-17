import { digestOf, signAck } from './acks'
import { itemSummary } from './lanItems'

function parseJson(body) {
  try {
    return JSON.parse(body.toString('utf8'))
  } catch {
    return null
  }
}

// A header naming a sender is no proof: charging its allowance before the signature would let anyone silence them.
export function createItemReceiver({
  trustedFps,
  open,
  store,
  notify,
  signingKey,
  senderLimit,
  remoteLimit,
  now = Date.now
}) {
  async function reply(conn, digest, ok, reason) {
    const sig = signAck(await signingKey(), { kind: 'item', digest, ok, reason })
    conn.send({ type: 'item-ack', ok, ...(reason ? { reason } : {}), sig })
    conn.close()
  }

  return async function onItem({ header, body }, conn) {
    const allowed = remoteLimit.allow(conn.remote, now())
    if (!allowed || !body || !trustedFps().has(header.fp)) return conn.destroy()
    const digest = digestOf(body)
    const sealed = parseJson(body)
    const opened = sealed && (await open({ sealed, fromFp: header.fp }))
    if (!opened) return reply(conn, digest, false, 'bad-item')
    if (!senderLimit.allow(header.fp, now())) return reply(conn, digest, false, 'rate-limited')
    const at = now()
    const stored = store({ sealed, fromFp: header.fp, now: at, expiresAt: opened.entry.expiresAt })
    if (stored.error) return reply(conn, digest, false, stored.error)
    await reply(conn, digest, true)
    notify(itemSummary({ id: stored.id, receivedAt: at }, opened))
  }
}
