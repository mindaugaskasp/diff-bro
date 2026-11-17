// Both lengths are checked against the caps before what they announce is buffered.
export const FRAME_LIMITS = { header: 8 * 1024, item: 25 * 1024 * 1024 }

const FP = /^[0-9a-f]{32}$/
const B64_32 = /^[A-Za-z0-9+/]{43}=$/
const isText = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max
const isKey = (v) => isText(v, 4096) && v.startsWith('dbk1:')

const SHAPES = {
  'add-request': { key: isKey, name: (v) => isText(v, 64), commit: (v) => B64_32.test(v) },
  'add-reply': { key: isKey, name: (v) => isText(v, 64), nonce: (v) => B64_32.test(v) },
  'add-reveal': { nonce: (v) => B64_32.test(v) },
  'add-result': { result: (v) => ['matched', 'mismatched', 'cancelled'].includes(v) },
  item: {
    kind: (v) => v === 'diff' || v === 'snippet',
    name: (v) => isText(v, 512),
    fp: (v) => FP.test(v)
  },
  'item-ack': {
    ok: (v) => typeof v === 'boolean',
    reason: (v) => v === undefined || isText(v, 64)
  },
  revoke: { fp: (v) => FP.test(v), at: Number.isSafeInteger, sig: (v) => isText(v, 512) }
}

const bodyLimit = (type) => (type === 'item' ? FRAME_LIMITS.item : 0)

export function validateHeader(header) {
  if (!header || typeof header !== 'object' || Object.getPrototypeOf(header) !== Object.prototype)
    return false
  const shape = SHAPES[header.type]
  if (!shape) return false
  const keys = Object.keys(header).filter((k) => k !== 'type')
  if (keys.some((k) => !(k in shape))) return false
  return Object.entries(shape).every(([k, ok]) => ok(header[k]))
}

const u32 = (n) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

export function encodeFrame(header, body = null) {
  if (!validateHeader(header)) throw new Error('bad-frame')
  const json = Buffer.from(JSON.stringify(header))
  const payload = body ?? Buffer.alloc(0)
  if (json.length > FRAME_LIMITS.header || payload.length > bodyLimit(header.type))
    throw new Error('frame-too-large')
  return Buffer.concat([u32(json.length), json, u32(payload.length), payload])
}

function parseHeader(bytes) {
  let header
  try {
    header = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error('bad-frame')
  }
  if (!validateHeader(header)) throw new Error('bad-frame')
  return header
}

function takeFrame(state) {
  const { buf, accept } = state
  if (buf.length < 4) return null
  const headerLength = buf.readUInt32BE(0)
  if (headerLength > FRAME_LIMITS.header) throw new Error('frame-too-large')
  if (buf.length < 8 + headerLength) return null
  const header = parseHeader(buf.subarray(4, 4 + headerLength))
  if (!accept(header)) throw new Error('not-accepted')
  const bodyLength = buf.readUInt32BE(4 + headerLength)
  if (bodyLength > bodyLimit(header.type)) throw new Error('frame-too-large')
  const end = 8 + headerLength + bodyLength
  if (buf.length < end) return null
  const body = bodyLength ? Buffer.from(buf.subarray(8 + headerLength, end)) : null
  state.buf = buf.subarray(end)
  return { header, body }
}

export function createFrameReader({ accept = () => true } = {}) {
  const state = { buf: Buffer.alloc(0), accept }
  return {
    push(chunk) {
      state.buf = state.buf.length ? Buffer.concat([state.buf, chunk]) : chunk
      const frames = []
      for (let frame = takeFrame(state); frame; frame = takeFrame(state)) frames.push(frame)
      return frames
    }
  }
}
