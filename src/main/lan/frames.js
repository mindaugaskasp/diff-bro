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
  'add-result': { result: (v) => ['matched', 'mismatched', 'cancelled', 'expired'].includes(v) },
  item: { fp: (v) => FP.test(v) },
  'item-ack': {
    ok: (v) => typeof v === 'boolean',
    reason: (v) => v === undefined || isText(v, 64),
    sig: (v) => isText(v, 200)
  },
  'revoke-ack': { sig: (v) => isText(v, 200) },
  revoke: { fp: (v) => FP.test(v), at: Number.isSafeInteger, sig: (v) => isText(v, 512) }
}

const bodyLimit = (type) => (type === 'item' ? FRAME_LIMITS.item : 0)

export function validateHeader(header) {
  if (!header || typeof header !== 'object' || Object.getPrototypeOf(header) !== Object.prototype)
    return false
  if (!Object.hasOwn(SHAPES, header.type)) return false
  const shape = SHAPES[header.type]
  const keys = Object.keys(header).filter((k) => k !== 'type')
  if (keys.some((k) => !Object.hasOwn(shape, k))) return false
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

// Chunks are joined once the bytes a step needs have all arrived, never on every chunk.
function flatten(state, n) {
  if (state.size < n) return null
  if (state.chunks[0].length < n) state.chunks = [Buffer.concat(state.chunks)]
  return state.chunks[0]
}

function readHead(state) {
  const start = flatten(state, 4)
  if (!start) return null
  const headerLength = start.readUInt32BE(0)
  if (headerLength > FRAME_LIMITS.header) throw new Error('frame-too-large')
  const head = flatten(state, 8 + headerLength)
  if (!head) return null
  const header = parseHeader(head.subarray(4, 4 + headerLength))
  if (!state.accept(header)) throw new Error('not-accepted')
  const bodyLength = head.readUInt32BE(4 + headerLength)
  if (bodyLength > bodyLimit(header.type)) throw new Error('frame-too-large')
  return { header, bodyStart: 8 + headerLength, end: 8 + headerLength + bodyLength }
}

function takeFrame(state) {
  state.pending ??= readHead(state)
  const { pending } = state
  const buf = pending && flatten(state, pending.end)
  if (!buf) return null
  const body =
    pending.end > pending.bodyStart
      ? Buffer.from(buf.subarray(pending.bodyStart, pending.end))
      : null
  const rest = buf.subarray(pending.end)
  Object.assign(state, { chunks: rest.length ? [rest] : [], size: rest.length, pending: null })
  return { header: pending.header, body }
}

export function createFrameReader({ accept = () => true } = {}) {
  const state = { chunks: [], size: 0, pending: null, accept }
  return {
    push(chunk) {
      state.chunks.push(chunk)
      state.size += chunk.length
      const frames = []
      for (let frame = takeFrame(state); frame; frame = takeFrame(state)) frames.push(frame)
      return frames
    },
    isMidFrame: () => state.size > 0
  }
}
