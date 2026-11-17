import { describe, expect, it } from 'vitest'
import {
  announcementsFrom,
  asksForService,
  decodePacket,
  encodeAnnouncement,
  encodeQuery
} from '../../../src/main/lan/dnsSd'

const FP = 'ab'.repeat(16)

describe('query', () => {
  it('asks for the DiffBro service', () => {
    const packet = decodePacket(encodeQuery())
    expect(packet.isResponse).toBe(false)
    expect(asksForService(packet)).toBe(true)
  })

  it('ignores a query for another service', () => {
    const other = encodeQuery().toString('latin1').replace('diffbro', 'printer')
    expect(asksForService(decodePacket(Buffer.from(other, 'latin1')))).toBe(false)
  })
})

describe('announcement', () => {
  it('round-trips name, fingerprint, port and version', () => {
    const packet = decodePacket(
      encodeAnnouncement({ fp: FP, name: 'Ana’s MacBook Pro', port: 51515 })
    )
    expect(packet.isResponse).toBe(true)
    expect(announcementsFrom(packet)).toEqual([
      { fp: FP, name: 'Ana’s MacBook Pro', port: 51515, version: 1, ttl: 120 }
    ])
  })

  it('says goodbye with a zero TTL', () => {
    const packet = decodePacket(encodeAnnouncement({ fp: FP, name: 'Ana', port: 1, ttl: 0 }))
    expect(announcementsFrom(packet)[0].ttl).toBe(0)
  })

  it('cuts a long name to fit a TXT string', () => {
    const long = 'é'.repeat(200)
    const [peer] = announcementsFrom(
      decodePacket(encodeAnnouncement({ fp: FP, name: long, port: 1 }))
    )
    expect(peer.name.length).toBeLessThanOrEqual(64)
  })

  it('drops an instance whose TXT is not ours', () => {
    const bytes = encodeAnnouncement({ fp: FP, name: 'Ana', port: 1 })
    const tampered = Buffer.from(
      bytes.toString('latin1').replace(`fp=${FP}`, `fp=${'zz'.repeat(16)}`),
      'latin1'
    )
    expect(announcementsFrom(decodePacket(tampered))).toEqual([])
  })
})

function nameBytes(labels) {
  return Buffer.concat([
    ...labels.map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])),
    Buffer.from([0])
  ])
}

describe('decoding foreign packets', () => {
  it('follows compression pointers', () => {
    const header = Buffer.from([0, 0, 0x84, 0, 0, 0, 0, 2, 0, 0, 0, 0])
    const service = nameBytes(['_diffbro', '_tcp', 'local'])
    const ptrName = service
    const instance = Buffer.concat([Buffer.from([32]), Buffer.from(FP), Buffer.from([0xc0, 12])])
    const ptr = Buffer.concat([
      ptrName,
      Buffer.from([0, 12, 0, 1, 0, 0, 0, 120, 0, instance.length]),
      instance
    ])
    const instPtr = 12 + ptrName.length + 10
    const txtData = Buffer.concat(
      ['v=1', `fp=${FP}`, 'name=Ben', 'port=4000'].map((s) =>
        Buffer.concat([Buffer.from([s.length]), Buffer.from(s)])
      )
    )
    const txt = Buffer.concat([
      Buffer.from([
        0xc0 | (instPtr >> 8),
        instPtr & 0xff,
        0,
        16,
        0x80,
        1,
        0,
        0,
        0,
        120,
        0,
        txtData.length
      ]),
      txtData
    ])
    const packet = decodePacket(Buffer.concat([header, ptr, txt]))
    expect(announcementsFrom(packet)).toEqual([
      { fp: FP, name: 'Ben', port: 4000, version: 1, ttl: 120 }
    ])
  })

  it('refuses a pointer loop', () => {
    const header = Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])
    const loop = Buffer.from([0xc0, 12, 0, 12, 0, 1])
    expect(decodePacket(Buffer.concat([header, loop]))).toBeNull()
  })

  it('refuses a truncated packet', () => {
    const bytes = encodeAnnouncement({ fp: FP, name: 'Ana', port: 1 })
    expect(decodePacket(bytes.subarray(0, bytes.length - 5))).toBeNull()
    expect(decodePacket(Buffer.alloc(5))).toBeNull()
  })

  it('keeps its place after a label that is not valid UTF-8', () => {
    const header = Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])
    const name = Buffer.from([2, 0xff, 0xfe, 5, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0, 0, 12, 0, 1])
    const packet = decodePacket(Buffer.concat([header, name]))
    expect(packet.questions[0].type).toBe(12)
    expect(packet.questions[0].name.endsWith('.local')).toBe(true)
  })

  it('refuses an over-long label', () => {
    const header = Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])
    const label = Buffer.concat([
      Buffer.from([70]),
      Buffer.alloc(70, 97),
      Buffer.from([0, 0, 12, 0, 1])
    ])
    expect(decodePacket(Buffer.concat([header, label]))).toBeNull()
  })
})

describe('hostile packets', () => {
  const header = (answers) =>
    Buffer.from([0, 0, 0x84, 0, 0, 0, answers >> 8, answers & 255, 0, 0, 0, 0])
  const txtRecord = (name) => {
    const data = Buffer.concat(
      ['v=1', `fp=${FP}`, `name=${name}`, 'port=4000'].map((s) =>
        Buffer.concat([Buffer.from([Buffer.byteLength(s)]), Buffer.from(s)])
      )
    )
    const owner = nameBytes([FP, '_diffbro', '_tcp', 'local'])
    return Buffer.concat([
      owner,
      Buffer.from([0, 16, 0, 1, 0, 0, 0, 120, data.length >> 8, data.length & 255]),
      data
    ])
  }

  it('refuses a name longer than DNS allows', () => {
    const long = nameBytes(Array.from({ length: 6 }, () => 'x'.repeat(60)))
    const rec = Buffer.concat([long, Buffer.from([0, 16, 0, 1, 0, 0, 0, 120, 0, 0])])
    expect(decodePacket(Buffer.concat([header(1), rec]))).toBeNull()
  })

  it('refuses a packet with more records than any announcement needs', () => {
    const rec = Buffer.concat([Buffer.from([0]), Buffer.from([0, 1, 0, 1, 0, 0, 0, 120, 0, 0])])
    expect(decodePacket(Buffer.concat([header(200), ...Array(200).fill(rec)]))).toBeNull()
  })

  it('refuses an oversized datagram before parsing it', () => {
    expect(decodePacket(Buffer.concat([header(0), Buffer.alloc(10_000)]))).toBeNull()
  })

  it('strips direction overrides and invisible characters from an announced name', () => {
    const [peer] = announcementsFrom(
      decodePacket(Buffer.concat([header(1), txtRecord('\u202eecilA\u200b')]))
    )
    expect(peer.name).toBe('ecilA')
  })
})
