import { describe, expect, it, vi } from 'vitest'
import { PAIRING_MS, createPairing } from '../../../src/main/lan/pairing'
import { formatCode, normalizeCode } from '../../../src/main/lan/pairingCode'

const flush = () => new Promise((r) => setTimeout(r, 0))

function fakeTimers() {
  const pending = new Set()
  return {
    set: (fn) => {
      const t = { fn }
      pending.add(t)
      return t
    },
    clear: (t) => pending.delete(t),
    fireAll: () => [...pending].forEach((t) => (pending.delete(t), t.fn()))
  }
}

function linkedConns(remote = '192.168.1.9') {
  const make = () => ({ remote, closed: false, sent: [], handlers: null })
  const a = make()
  const b = make()
  const wire = (from, to) => {
    from.send = (header) => {
      if (from.closed) return
      from.sent.push(header)
      queueMicrotask(() => !to.closed && to.handlers?.onFrame({ header, body: null }, to))
    }
    from.close = () => {
      if (from.closed) return
      from.closed = true
      queueMicrotask(() => {
        to.closed = true
        from.handlers?.onClose?.(from)
        to.handlers?.onClose?.(to)
      })
    }
    from.destroy = from.close
  }
  wire(a, b)
  wire(b, a)
  return [a, b]
}

function peer(fp, name, extra = {}) {
  const events = []
  const stored = []
  const timers = fakeTimers()
  const pairing = createPairing({
    identity: { fp, keyText: `key-${fp}`, name: () => name },
    parseKey: (text) => {
      if (!text.startsWith('key-')) throw new Error('bad key')
      return { fp: text.slice(4), key: { text } }
    },
    storeKey: async (key, keyFp, label) => stored.push({ key, keyFp, label }),
    emit: (e) => events.push(e),
    isVisible: () => true,
    allowRequest: () => true,
    timers,
    now: () => 1000,
    ...extra
  })
  return { fp, name, pairing, events, stored, timers, last: () => events.at(-1) }
}

const A = 'aa'.repeat(16)
const B = 'bb'.repeat(16)

function connectHolder(holder) {
  return async (_fp, handlers) => {
    const [mine, theirs] = linkedConns()
    mine.handlers = handlers
    theirs.handlers = {
      onFrame: ({ header }, conn) => {
        const route = {
          'add-request': holder.pairing.onRequest,
          'add-reveal': holder.pairing.onReveal,
          'add-result': holder.pairing.onResult
        }[header.type]
        route({ header }, conn)
      },
      onClose: (conn) => holder.pairing.onClosed(conn)
    }
    return mine
  }
}

async function startAdding(extraHolder = {}) {
  const ana = peer(A, 'Ana', extraHolder)
  const ben = peer(B, 'Ben', { connect: connectHolder(ana) })
  const started = await ben.pairing.add(A, 'Ana')
  await flush()
  return { ana, ben, started }
}

describe('adding someone', () => {
  it('shows the same code on the holder that the adder must type', async () => {
    const { ana, ben, started } = await startAdding()
    expect(started.ok).toBe(true)
    expect(ben.last()).toMatchObject({ role: 'adder', stage: 'enter-code', name: 'Ana', fp: A })
    expect(ben.last().code).toBeUndefined()
    const shown = ana.last()
    expect(shown).toMatchObject({ role: 'holder', stage: 'show-code', name: 'Ben', fp: B })
    expect(normalizeCode(shown.code)).toBe(shown.code)
    expect(shown.expiresAt).toBe(1000 + PAIRING_MS)
  })

  it('stores the holder’s key when the code matches, and tells the holder', async () => {
    const { ana, ben, started } = await startAdding()
    const code = formatCode(ana.last().code).toLowerCase()
    expect(await ben.pairing.submitCode(started.id, code)).toEqual({ ok: true, matched: true })
    await flush()
    expect(ben.stored).toEqual([{ key: { text: `key-${A}` }, keyFp: A, label: 'Ana' }])
    expect(ben.last().stage).toBe('added')
    expect(ana.last()).toMatchObject({ stage: 'added-you', name: 'Ben', fp: B })
    expect(ana.stored).toEqual([])
  })

  it('a wrong code stores nothing and ends it on both sides', async () => {
    const { ana, ben, started } = await startAdding()
    const wrong = ana.last().code === 'K7Q4ZP' ? 'K7Q4ZR' : 'K7Q4ZP'
    expect(await ben.pairing.submitCode(started.id, wrong)).toEqual({ ok: true, matched: false })
    await flush()
    expect(ben.stored).toEqual([])
    expect(ben.last().stage).toBe('mismatch')
    expect(ana.last().stage).toBe('mismatch')
    expect(await ben.pairing.submitCode(started.id, wrong)).toEqual({ error: 'no-request' })
  })

  it('cancelling on either side shows Request cancelled on the other', async () => {
    const one = await startAdding()
    one.ben.pairing.cancel(one.started.id)
    await flush()
    expect(one.ana.last().stage).toBe('cancelled')

    const two = await startAdding()
    two.ana.pairing.cancel(two.ana.last().id)
    await flush()
    expect(two.ben.last().stage).toBe('cancelled')
  })

  it('expiry shows Code expired on both sides, not Connection lost', async () => {
    const { ana, ben } = await startAdding()
    ana.timers.fireAll()
    await flush()
    expect(ana.last().stage).toBe('expired')
    expect(ben.last().stage).toBe('expired')
  })

  it('a dropped connection shows Connection lost on both sides', async () => {
    const { ana, ben } = await startAdding()
    ana.pairing.cancelAll()
    await flush()
    expect(ana.last().stage).toBe('connection-lost')
    expect(ben.last().stage).toBe('connection-lost')
  })

  it('refuses when the peer cannot be reached', async () => {
    const ben = peer(B, 'Ben', {
      connect: async () => {
        throw new Error('ECONNREFUSED')
      }
    })
    expect(await ben.pairing.add(A, 'Ana')).toEqual({ error: 'not-reachable' })
    expect(ben.events).toEqual([])
  })

  it('allows one add at a time', async () => {
    const { ben } = await startAdding()
    expect(await ben.pairing.add(A, 'Ana')).toEqual({ error: 'busy' })
  })
})

describe('the holder refuses', () => {
  it('when hidden', async () => {
    const { ben, started } = await startAdding({ isVisible: () => false })
    expect(started.ok).toBe(true)
    await flush()
    expect(ben.last().stage).toBe('connection-lost')
  })

  it('when rate-limited', async () => {
    const { ben } = await startAdding({ allowRequest: () => false })
    await flush()
    expect(ben.last().stage).toBe('connection-lost')
  })

  it('a reply from a different key than the one announced', async () => {
    const ana = peer(A, 'Ana', {
      identity: { fp: A, keyText: `key-${'cc'.repeat(16)}`, name: () => 'Ana' }
    })
    const ben = peer(B, 'Ben', { connect: connectHolder(ana) })
    await ben.pairing.add(A, 'Ana')
    await flush()
    expect(ben.last().stage).toBe('connection-lost')
    expect(ben.stored).toEqual([])
  })

  it('a reveal that does not match the commitment', async () => {
    const ana = peer(A, 'Ana')
    const [toAna, fromBen] = linkedConns()
    fromBen.handlers = { onFrame: () => {}, onClose: () => ana.pairing.onClosed(toAna) }
    toAna.handlers = { onFrame: () => {}, onClose: () => {} }
    ana.pairing.onRequest(
      {
        header: { type: 'add-request', key: `key-${B}`, name: 'Ben', commit: 'x'.repeat(43) + '=' }
      },
      toAna
    )
    ana.pairing.onReveal({ header: { type: 'add-reveal', nonce: 'y'.repeat(43) + '=' } }, toAna)
    await flush()
    expect(ana.last().stage).toBe('connection-lost')
    expect(ana.events.some((e) => e.code)).toBe(false)
  })

  it('its own key, and a malformed key', () => {
    const ana = peer(A, 'Ana')
    const destroy = vi.fn()
    ana.pairing.onRequest(
      { header: { type: 'add-request', key: `key-${A}`, name: 'Me', commit: 'c' } },
      { remote: 'x', destroy }
    )
    ana.pairing.onRequest(
      { header: { type: 'add-request', key: 'junk', name: 'X', commit: 'c' } },
      { remote: 'x', destroy }
    )
    expect(destroy).toHaveBeenCalledTimes(2)
    expect(ana.events).toEqual([])
  })

  it('a reveal or result on a connection it does not know', () => {
    const ana = peer(A, 'Ana')
    const destroy = vi.fn()
    ana.pairing.onReveal({ header: { type: 'add-reveal', nonce: 'n' } }, { destroy })
    ana.pairing.onResult({ header: { type: 'add-result', result: 'matched' } }, { destroy })
    expect(destroy).toHaveBeenCalledTimes(2)
  })
})
