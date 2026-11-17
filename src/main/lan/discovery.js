import dgram from 'dgram'
import { isPrivateAddress } from './privateAddress'
import { announcementsFrom, asksForService, decodePacket, encodeQuery } from './dnsSd'

const GROUP = '224.0.0.251'
const PORT = 5353

export function createDiscovery({ addresses, announcement, onPeer }) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  const sendVia = (address, buf) =>
    new Promise((done) => {
      try {
        socket.setMulticastInterface(address)
        socket.send(buf, PORT, GROUP, () => done())
      } catch {
        done()
      }
    })
  const send = (buf) => Promise.all(addresses.map((address) => sendVia(address, buf)))
  const announce = () => {
    const packet = announcement()
    if (packet) send(packet)
  }
  socket.on('message', (msg, rinfo) => {
    if (!isPrivateAddress(rinfo.address)) return
    const packet = decodePacket(msg)
    if (asksForService(packet)) return announce()
    for (const peer of announcementsFrom(packet)) onPeer({ ...peer, address: rinfo.address })
  })
  socket.on('error', () => socket.close())
  return new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.bind(PORT, () => {
      socket.setMulticastTTL(1)
      socket.setMulticastLoopback(true)
      for (const address of addresses) {
        try {
          socket.addMembership(GROUP, address)
        } catch {
          continue
        }
      }
      resolve({
        announce,
        query: () => send(encodeQuery()),
        sendRaw: send,
        close: () => new Promise((done) => socket.close(() => done()))
      })
    })
  })
}
