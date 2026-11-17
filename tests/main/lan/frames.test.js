import { describe, expect, it } from 'vitest'
import {
  FRAME_LIMITS,
  createFrameReader,
  encodeFrame,
  validateHeader
} from '../../../src/main/lan/frames'

const KEY = 'dbk1:' + 'A'.repeat(200)
const NONCE = Buffer.alloc(32, 1).toString('base64')
const COMMIT = Buffer.alloc(32, 2).toString('base64')
const FP = 'ab'.repeat(16)

const read = (buffers) => {
  const reader = createFrameReader()
  const out = []
  for (const b of buffers) out.push(...reader.push(b))
  return out
}

describe('encode and read', () => {
  it('round-trips a header-only frame', () => {
    const header = { type: 'add-reveal', nonce: NONCE }
    expect(read([encodeFrame(header)])).toEqual([{ header, body: null }])
  })

  it('round-trips a frame with a body, delivered in pieces', () => {
    const body = Buffer.from(JSON.stringify({ sealed: 'x'.repeat(5000) }))
    const header = { type: 'item', kind: 'snippet', name: 'nginx reload', fp: FP }
    const bytes = encodeFrame(header, body)
    const pieces = [bytes.subarray(0, 3), bytes.subarray(3, 40), bytes.subarray(40)]
    const [frame] = read(pieces)
    expect(frame.header).toEqual(header)
    expect(frame.body.equals(body)).toBe(true)
  })

  it('reads several frames from one stream', () => {
    const a = encodeFrame({ type: 'add-reveal', nonce: NONCE })
    const b = encodeFrame({ type: 'add-result', result: 'matched' })
    expect(read([Buffer.concat([a, b])]).map((f) => f.header.type)).toEqual([
      'add-reveal',
      'add-result'
    ])
  })
})

describe('refusals', () => {
  it('refuses a header declared over the cap before reading it', () => {
    const reader = createFrameReader()
    const prefix = Buffer.alloc(4)
    prefix.writeUInt32BE(FRAME_LIMITS.header + 1)
    expect(() => reader.push(prefix)).toThrow('frame-too-large')
  })

  it('refuses a body declared over the cap for its type', () => {
    const header = Buffer.from(JSON.stringify({ type: 'add-reveal', nonce: NONCE }))
    const parts = [Buffer.alloc(4), header, Buffer.alloc(4)]
    parts[0].writeUInt32BE(header.length)
    parts[2].writeUInt32BE(10)
    expect(() => createFrameReader().push(Buffer.concat(parts))).toThrow('frame-too-large')
  })

  it('refuses an item body over the item cap', () => {
    const header = Buffer.from(JSON.stringify({ type: 'item', kind: 'diff', name: 'n', fp: FP }))
    const parts = [Buffer.alloc(4), header, Buffer.alloc(4)]
    parts[0].writeUInt32BE(header.length)
    parts[2].writeUInt32BE(FRAME_LIMITS.item + 1)
    expect(() => createFrameReader().push(Buffer.concat(parts))).toThrow('frame-too-large')
  })

  it('refuses a header that is not JSON', () => {
    const junk = Buffer.from('{nope')
    const prefix = Buffer.alloc(4)
    prefix.writeUInt32BE(junk.length)
    expect(() => createFrameReader().push(Buffer.concat([prefix, junk, Buffer.alloc(4)]))).toThrow(
      'bad-frame'
    )
  })

  it('refuses to encode an invalid header', () => {
    expect(() => encodeFrame({ type: 'add-reveal' })).toThrow('bad-frame')
  })
})

describe('validateHeader', () => {
  it.each([
    [{ type: 'add-request', key: KEY, name: 'Ben', commit: COMMIT }],
    [{ type: 'add-reply', key: KEY, name: 'Ana', nonce: NONCE }],
    [{ type: 'add-reveal', nonce: NONCE }],
    [{ type: 'add-result', result: 'mismatched' }],
    [{ type: 'item', kind: 'diff', name: 'config', fp: FP }],
    [{ type: 'item-ack', ok: false, reason: 'not-trusted' }],
    [{ type: 'revoke', fp: FP, at: 1, sig: 'c2ln' }]
  ])('accepts %j', (h) => expect(validateHeader(h)).toBe(true))

  it.each([
    [null],
    [{ type: 'mystery' }],
    [{ type: 'add-request', key: 'nope', name: 'Ben', commit: COMMIT }],
    [{ type: 'add-request', key: KEY, name: 'x'.repeat(65), commit: COMMIT }],
    [{ type: 'add-request', key: KEY, name: 'Ben', commit: 'short' }],
    [{ type: 'add-result', result: 'maybe' }],
    [{ type: 'item', kind: 'secret', name: 'n', fp: FP }],
    [{ type: 'item', kind: 'diff', name: 'x'.repeat(513), fp: FP }],
    [{ type: 'item', kind: 'diff', name: 'n', fp: 'zz' }],
    [{ type: 'revoke', fp: FP, at: 'yesterday', sig: 'c2ln' }],
    [{ type: 'add-reveal', nonce: NONCE, __proto__: { polluted: true }, extra: 1 }]
  ])('refuses %j', (h) => expect(validateHeader(h)).toBe(false))
})
