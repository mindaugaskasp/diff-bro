import { randomUUID } from 'crypto'
import { codesMatch, commitmentOf, isRevealValid, newNonce, pairingCode } from './pairingCode'
import { cleanPeerName } from './peerName'

export const PAIRING_MS = 120_000
// A request that never reveals must not hold the one holder slot for two minutes.
export const REVEAL_MS = 10_000
const NAME_CHARS = 64

const RESULT_STAGE = {
  matched: 'added-you',
  mismatched: 'mismatch',
  cancelled: 'cancelled',
  expired: 'expired'
}

const view = (s) => ({
  id: s.id,
  role: s.role,
  stage: s.stage,
  fp: s.peerFp,
  name: s.name,
  expiresAt: s.expiresAt,
  ...(s.role === 'holder' && s.stage === 'show-code' ? { code: s.code } : {})
})

const short = (fp) => fp.slice(0, 8)
const note = (ctx, message) => ctx.log?.(message)
const errorText = (err) =>
  [err?.code ?? err?.message, err?.address && `${err.address}:${err.port}`]
    .filter(Boolean)
    .join(' ')

function finish(ctx, s, stage, { silent = false } = {}) {
  if (s.done) return
  s.done = true
  ctx.timers.clear(s.timer)
  ctx.timers.clear(s.revealTimer)
  s.stage = stage
  ctx.sessions.delete(s.id)
  s.conn?.close()
  if (!silent) ctx.emit(view(s))
}

function open(ctx, fields) {
  const s = { id: randomUUID(), done: false, expiresAt: ctx.now() + PAIRING_MS, ...fields }
  s.timer = ctx.timers.set(() => {
    s.conn?.send({ type: 'add-result', result: 'expired' })
    finish(ctx, s, 'expired')
  }, PAIRING_MS)
  ctx.sessions.set(s.id, s)
  if (s.conn) ctx.byConn.set(s.conn, s)
  return s
}

const isBusy = (ctx, role) => [...ctx.sessions.values()].some((s) => s.role === role)

function parsedOrNull(ctx, text) {
  try {
    return ctx.parseKey(text)
  } catch {
    return null
  }
}

function onAdderFrame(ctx, s, { header }) {
  if (header.type === 'add-result' && RESULT_STAGE[header.result])
    return finish(ctx, s, header.result === 'expired' ? 'expired' : 'cancelled')
  const parsed = header.type === 'add-reply' && parsedOrNull(ctx, header.key)
  if (s.stage !== 'connecting' || !parsed || parsed.fp !== s.peerFp) {
    note(
      ctx,
      `add ${short(s.peerFp)}: unexpected ${header.type} at ${s.stage}${parsed ? ` from ${short(parsed.fp)}` : ''}`
    )
    return finish(ctx, s, 'connection-lost')
  }
  Object.assign(s, { holderKey: parsed.key, stage: 'enter-code' })
  s.expected = pairingCode({
    holderFp: s.peerFp,
    adderFp: ctx.identity.fp,
    holderNonce: header.nonce,
    adderNonce: s.nonce
  })
  s.conn.send({ type: 'add-reveal', nonce: s.nonce })
  ctx.emit(view(s))
}

async function add(ctx, peerFp, name) {
  if (isBusy(ctx, 'adder')) return { error: 'busy' }
  const s = open(ctx, { role: 'adder', peerFp, name, nonce: newNonce(), stage: 'connecting' })
  try {
    s.conn = await ctx.connect(peerFp, {
      onFrame: (frame) => onAdderFrame(ctx, s, frame),
      onClose: () => {
        if (s.stage === 'connecting') note(ctx, `add ${short(peerFp)}: closed before the code step`)
        finish(ctx, s, 'connection-lost')
      }
    })
  } catch (err) {
    note(ctx, `add ${short(peerFp)}: could not connect (${errorText(err)})`)
    finish(ctx, s, 'connection-lost', { silent: true })
    return { error: 'not-reachable' }
  }
  if (s.done) {
    s.conn.close()
    return { error: 'not-reachable' }
  }
  const { keyText, name: myName } = ctx.identity
  s.conn.send({ type: 'add-request', key: keyText, name: myName(), commit: commitmentOf(s.nonce) })
  ctx.emit(view(s))
  return { ok: true, id: s.id }
}

async function submitCode(ctx, id, code) {
  const s = ctx.sessions.get(id)
  if (!s || s.role !== 'adder' || s.stage !== 'enter-code') return { error: 'no-request' }
  const matched = codesMatch(s.expected, code)
  if (matched) await ctx.storeKey(s.holderKey, s.peerFp, s.name)
  s.conn.send({ type: 'add-result', result: matched ? 'matched' : 'mismatched' })
  finish(ctx, s, matched ? 'added' : 'mismatch')
  return { ok: true, matched }
}

function cancel(ctx, id) {
  const s = ctx.sessions.get(id)
  if (!s) return { error: 'no-request' }
  s.conn?.send({ type: 'add-result', result: 'cancelled' })
  finish(ctx, s, 'cancelled', { silent: true })
  return { ok: true }
}

function refusalOf(ctx, header, conn) {
  if (!ctx.isVisible()) return 'not visible'
  if (isBusy(ctx, 'holder')) return 'busy with another request'
  if (!ctx.allowRequest(conn.remote)) return 'rate-limited'
  const parsed = parsedOrNull(ctx, header.key)
  if (!parsed) return 'unreadable key'
  return parsed.fp === ctx.identity.fp ? 'own key' : null
}

function onRequest(ctx, { header }, conn) {
  const refusal = refusalOf(ctx, header, conn)
  if (refusal) {
    note(ctx, `request from ${conn.remote} refused: ${refusal}`)
    return conn.destroy()
  }
  const parsed = parsedOrNull(ctx, header.key)
  const s = open(ctx, {
    role: 'holder',
    conn,
    peerFp: parsed.fp,
    name: cleanPeerName(header.name, NAME_CHARS),
    commit: header.commit,
    nonce: newNonce(),
    stage: 'waiting'
  })
  s.revealTimer = ctx.timers.set(() => {
    if (s.stage === 'waiting') finish(ctx, s, 'connection-lost', { silent: true })
  }, REVEAL_MS)
  const { keyText, name } = ctx.identity
  conn.send({ type: 'add-reply', key: keyText, name: name(), nonce: s.nonce })
}

function onReveal(ctx, { header }, conn) {
  const s = ctx.byConn.get(conn)
  if (!s || s.role !== 'holder' || s.stage !== 'waiting') return conn.destroy()
  if (!isRevealValid(s.commit, header.nonce)) return finish(ctx, s, 'connection-lost')
  s.code = pairingCode({
    holderFp: ctx.identity.fp,
    adderFp: s.peerFp,
    holderNonce: s.nonce,
    adderNonce: header.nonce
  })
  s.stage = 'show-code'
  ctx.emit(view(s))
}

function onResult(ctx, { header }, conn) {
  const s = ctx.byConn.get(conn)
  if (!s || s.role !== 'holder') return conn.destroy()
  finish(ctx, s, RESULT_STAGE[header.result])
}

export function createPairing(deps) {
  const ctx = {
    ...deps,
    now: deps.now ?? Date.now,
    timers: deps.timers ?? { set: setTimeout, clear: clearTimeout },
    sessions: new Map(),
    byConn: new WeakMap()
  }
  return {
    add: (fp, name) => add(ctx, fp, name),
    submitCode: (id, code) => submitCode(ctx, id, code),
    cancel: (id) => cancel(ctx, id),
    onRequest: (frame, conn) => onRequest(ctx, frame, conn),
    onReveal: (frame, conn) => onReveal(ctx, frame, conn),
    onResult: (frame, conn) => onResult(ctx, frame, conn),
    onClosed: (conn) => {
      const s = ctx.byConn.get(conn)
      if (s) finish(ctx, s, 'connection-lost')
    },
    cancelAll: () => [...ctx.sessions.values()].forEach((s) => finish(ctx, s, 'connection-lost'))
  }
}
