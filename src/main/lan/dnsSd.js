// In-repo rather than multicast-dns / bonjour-service: one service is a small subset, and rule 2 stays at zero.
import { cleanPeerName } from './peerName'

export const SERVICE = '_diffbro._tcp.local'
export const ANNOUNCE_TTL = 120

const TYPE = { PTR: 12, TXT: 16, SRV: 33 }
const CLASS_IN = 1
const CACHE_FLUSH = 0x8000
const MAX_JUMPS = 16
const FP = /^[0-9a-f]{32}$/
const NAME_CHARS = 64
const NAME_BYTES = 200

function encodeName(name) {
  const parts = name.split('.').map((label) => {
    const bytes = Buffer.from(label)
    return Buffer.concat([Buffer.from([bytes.length]), bytes])
  })
  return Buffer.concat([...parts, Buffer.from([0])])
}

const u16 = (n) => Buffer.from([n >> 8, n & 0xff])
const u32 = (n) => Buffer.from([(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff])

function record({ name, type, ttl, data, flush = false }) {
  const cls = CLASS_IN | (flush ? CACHE_FLUSH : 0)
  return Buffer.concat([encodeName(name), u16(type), u16(cls), u32(ttl), u16(data.length), data])
}

function header({ response, questions = 0, answers = 0 }) {
  return Buffer.concat([
    u16(0),
    u16(response ? 0x8400 : 0),
    u16(questions),
    u16(answers),
    u16(0),
    u16(0)
  ])
}

export function encodeQuery() {
  return Buffer.concat([
    header({ questions: 1 }),
    encodeName(SERVICE),
    u16(TYPE.PTR),
    u16(CLASS_IN)
  ])
}

function fitName(name) {
  let out = [...String(name)].slice(0, NAME_CHARS).join('')
  while (Buffer.byteLength(out) > NAME_BYTES) out = [...out].slice(0, -1).join('')
  return out
}

function txtData(entries) {
  return Buffer.concat(
    entries.map((s) => {
      const bytes = Buffer.from(s)
      return Buffer.concat([Buffer.from([bytes.length]), bytes])
    })
  )
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

// addr names the sender's own interface: a router relaying mDNS between subnets
// replaces the packet's source with its own address, which has nothing listening.
export function encodeAnnouncement({ fp, name, port, ttl = ANNOUNCE_TTL, addr }) {
  const instance = `${fp}.${SERVICE}`
  const fields = ['v=1', `fp=${fp}`, `name=${fitName(name)}`, `port=${port}`]
  if (IPV4.test(addr ?? '')) fields.push(`addr=${addr}`)
  const txt = txtData(fields)
  const srv = Buffer.concat([u16(0), u16(0), u16(port), encodeName(`${fp}.local`)])
  return Buffer.concat([
    header({ response: true, answers: 3 }),
    record({ name: SERVICE, type: TYPE.PTR, ttl, data: encodeName(instance) }),
    record({ name: instance, type: TYPE.TXT, ttl, data: txt, flush: true }),
    record({ name: instance, type: TYPE.SRV, ttl, data: srv, flush: true })
  ])
}

function followPointer(buf, offset, jumps) {
  if (offset + 1 >= buf.length || jumps > MAX_JUMPS) throw new Error('bad-pointer')
  return ((buf[offset] & 0x3f) << 8) | buf[offset + 1]
}

function readLabel(buf, offset) {
  const len = buf[offset]
  if (len > 63 || offset + 1 + len > buf.length) throw new Error('bad-label')
  return buf.toString('utf8', offset + 1, offset + 1 + len)
}

const MAX_NAME_BYTES = 255
const MAX_PACKET_BYTES = 9000
const MAX_ENTRIES = 64

function readName(buf, start) {
  const labels = []
  let bytes = 0
  let offset = start
  let end = -1
  let jumps = 0
  while (offset < buf.length && buf[offset] !== 0) {
    if ((buf[offset] & 0xc0) === 0xc0) {
      if (end === -1) end = offset + 2
      offset = followPointer(buf, offset, ++jumps)
      continue
    }
    const label = readLabel(buf, offset)
    bytes += 1 + buf[offset]
    if (bytes > MAX_NAME_BYTES) throw new Error('name-too-long')
    labels.push(label)
    offset += 1 + buf[offset]
  }
  if (offset >= buf.length) throw new Error('truncated')
  return { name: labels.join('.'), end: end === -1 ? offset + 1 : end }
}

function readRecord(buf, start) {
  const { name, end } = readName(buf, start)
  if (end + 10 > buf.length) throw new Error('truncated')
  const type = buf.readUInt16BE(end)
  const ttl = buf.readUInt32BE(end + 4)
  const length = buf.readUInt16BE(end + 8)
  const dataStart = end + 10
  if (dataStart + length > buf.length) throw new Error('truncated')
  return { record: { name, type, ttl, start: dataStart, length }, next: dataStart + length }
}

function readQuestions(buf, count) {
  const questions = []
  let offset = 12
  for (let i = 0; i < count; i++) {
    const { name, end } = readName(buf, offset)
    if (end + 4 > buf.length) throw new Error('truncated')
    questions.push({ name, type: buf.readUInt16BE(end) })
    offset = end + 4
  }
  return { questions, offset }
}

export function decodePacket(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12 || buf.length > MAX_PACKET_BYTES) return null
  try {
    const isResponse = (buf.readUInt16BE(2) & 0x8000) !== 0
    const counts = [4, 6, 8, 10].map((at) => buf.readUInt16BE(at))
    if (counts.reduce((a, b) => a + b, 0) > MAX_ENTRIES) return null
    const { questions, offset } = readQuestions(buf, counts[0])
    const records = []
    let next = offset
    for (let i = 0; i < counts[1] + counts[2] + counts[3]; i++) {
      const read = readRecord(buf, next)
      records.push({ ...read.record, buf })
      next = read.next
    }
    return { isResponse, questions, records }
  } catch {
    return null
  }
}

export const asksForService = (packet) =>
  !!packet &&
  !packet.isResponse &&
  packet.questions.some((q) => q.name.toLowerCase() === SERVICE && q.type === TYPE.PTR)

function txtEntries(rec) {
  const out = {}
  let at = rec.start
  const stop = rec.start + rec.length
  while (at < stop) {
    const len = rec.buf[at]
    const text = rec.buf.toString('utf8', at + 1, Math.min(at + 1 + len, stop))
    const eq = text.indexOf('=')
    if (eq > 0) out[text.slice(0, eq)] = text.slice(eq + 1)
    at += 1 + len
  }
  return out
}

function peerFromTxt(txt, ttl) {
  const port = Number(txt.port)
  const ok =
    txt.v === '1' && FP.test(txt.fp ?? '') && Number.isInteger(port) && port > 0 && port < 65536
  if (!ok || typeof txt.name !== 'string') return null
  const peer = { fp: txt.fp, name: cleanPeerName(txt.name, NAME_CHARS), port, version: 1, ttl }
  return IPV4.test(txt.addr ?? '') ? { ...peer, addr: txt.addr } : peer
}

export function announcementsFrom(packet) {
  if (!packet?.isResponse) return []
  const suffix = `.${SERVICE}`
  return packet.records
    .filter((r) => r.type === TYPE.TXT && r.name.toLowerCase().endsWith(suffix))
    .map((r) => ({
      label: r.name.split('.')[0].toLowerCase(),
      peer: peerFromTxt(txtEntries(r), r.ttl)
    }))
    .filter(({ label, peer }) => peer && peer.fp === label)
    .map(({ peer }) => peer)
}
