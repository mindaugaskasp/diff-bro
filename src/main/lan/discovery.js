import dgram from 'dgram'
import { isPrivateAddress, reachableAt } from './privateAddress'
import { announcementsFrom, asksForService, decodePacket, encodeQuery } from './dnsSd'

const GROUP = '224.0.0.251'
const PORT = 5353
const ANSWER_GAP_MS = 250

// An 'error' has already closed it, and closing a closed dgram socket throws.
function closeOnce(socket) {
  return new Promise((done) => {
    try {
      socket.close(() => done())
    } catch {
      done()
    }
  })
}

function multicastSender(socket, addresses) {
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
  // One packet per interface, each naming that interface's own address.
  const sendEach = (build) =>
    Promise.all(
      addresses.map((address) => {
        const packet = build(address)
        return packet ? sendVia(address, packet) : null
      })
    )
  return { send, sendEach }
}

export function createDiscovery({ addresses, announcement, onPeer }) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  const { send, sendEach } = multicastSender(socket, addresses)
  const announce = () => sendEach(announcement)
  // A flood of queries gets one answer per gap; dropping the rest would hide this peer for a minute.
  let answering = null
  const answer = () => {
    answering ??= setTimeout(() => {
      answering = null
      announce()
    }, ANSWER_GAP_MS)
  }
  socket.on('message', (msg, rinfo) => {
    if (!isPrivateAddress(rinfo.address)) return
    const packet = decodePacket(msg)
    if (asksForService(packet)) return answer()
    for (const peer of announcementsFrom(packet)) {
      onPeer({ ...peer, address: reachableAt(peer.addr, rinfo.address), source: rinfo.address })
    }
  })
  socket.on('error', () => closeOnce(socket))
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
        sendEach,
        close: () => {
          clearTimeout(answering)
          return closeOnce(socket)
        }
      })
    })
  })
}
