import { describe, expect, it, vi } from 'vitest'
import { createIdentityKeys } from '../../../src/main/sealing'
import { digestOf, verifyAck } from '../../../src/main/lan/acks'
import { createItemReceiver } from '../../../src/main/lan/itemReceiver'
import { createRateLimit } from '../../../src/main/lan/rateLimit'

const ANA = 'aa'.repeat(16)
const me = createIdentityKeys()
const genuine = Buffer.from(JSON.stringify({ sealed: 'real' }))

function setUp(overrides = {}) {
  const stored = []
  const notify = vi.fn()
  const receive = createItemReceiver({
    trustedFps: () => new Set([ANA]),
    open: async ({ sealed }) =>
      sealed.sealed === 'real'
        ? { entry: { kind: 'diff', name: 'n', expiresAt: 9e15 }, from: 'Ana', fp: ANA }
        : null,
    store: (record) => (stored.push(record), { id: `id-${stored.length}` }),
    notify,
    signingKey: async () => me.priv,
    senderLimit: createRateLimit({ limit: 10, windowMs: 60_000 }),
    remoteLimit: createRateLimit({ limit: 30, windowMs: 60_000 }),
    ...overrides
  })
  return { receive, stored, notify }
}

const conn = (remote) => ({
  remote,
  sent: [],
  send(h) {
    this.sent.push(h)
  },
  close: vi.fn(),
  destroy: vi.fn()
})

describe('receiving an item', () => {
  it("does not let forged frames in a trusted name use up that sender's allowance", async () => {
    const { receive, stored } = setUp()
    for (let i = 0; i < 10; i++)
      await receive(
        { header: { type: 'item', fp: ANA }, body: Buffer.from('junk') },
        conn('10.0.0.66')
      )
    await receive({ header: { type: 'item', fp: ANA }, body: genuine }, conn('10.0.0.5'))
    expect(stored).toHaveLength(1)
  })

  it('cuts off one address that floods, before reading anything', async () => {
    const { receive } = setUp({ remoteLimit: createRateLimit({ limit: 2, windowMs: 60_000 }) })
    const third = conn('10.0.0.66')
    for (let i = 0; i < 2; i++)
      await receive(
        { header: { type: 'item', fp: ANA }, body: Buffer.from('junk') },
        conn('10.0.0.66')
      )
    await receive({ header: { type: 'item', fp: ANA }, body: genuine }, third)
    expect(third.destroy).toHaveBeenCalled()
  })

  it('acknowledges with a signature over exactly the bytes it received', async () => {
    const { receive, notify } = setUp()
    const c = conn('10.0.0.5')
    await receive({ header: { type: 'item', fp: ANA }, body: genuine }, c)
    const [ack] = c.sent
    expect(ack).toMatchObject({ type: 'item-ack', ok: true })
    expect(
      verifyAck(me.pub.sign, { kind: 'item', digest: digestOf(genuine), ok: true }, ack.sig)
    ).toBe(true)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ id: 'id-1', from: 'Ana' }))
  })

  it('signs a refusal too, so the sender can tell it from a hijacked address', async () => {
    const { receive } = setUp({ store: () => ({ error: 'duplicate' }) })
    const c = conn('10.0.0.5')
    await receive({ header: { type: 'item', fp: ANA }, body: genuine }, c)
    const [ack] = c.sent
    expect(ack).toMatchObject({ ok: false, reason: 'duplicate' })
    expect(
      verifyAck(
        me.pub.sign,
        { kind: 'item', digest: digestOf(genuine), ok: false, reason: 'duplicate' },
        ack.sig
      )
    ).toBe(true)
  })
})
