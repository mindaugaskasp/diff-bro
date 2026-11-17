import net from 'net'
import { isPrivateAddress } from './privateAddress'
import { createFrameReader, encodeFrame } from './frames'

export const IDLE_MS = 150_000
export const MAX_CONNECTIONS = 32
export const MAX_PER_REMOTE = 4
// The idle timeout restarts on every byte, so a sender trickling one byte at a time never hits it.
export const FRAME_DEADLINE_MS = 60_000

export function createAdmission() {
  const open = new Map()
  return {
    admit(remote) {
      const count = open.get(remote) ?? 0
      if (count >= MAX_PER_REMOTE) return false
      open.set(remote, count + 1)
      return true
    },
    release(remote) {
      const count = (open.get(remote) ?? 1) - 1
      if (count > 0) open.set(remote, count)
      else open.delete(remote)
    }
  }
}

export function wrapSocket(socket, onFrame, accept) {
  const reader = createFrameReader({ accept })
  const conn = {
    remote: socket.remoteAddress,
    send: (header, body) => socket.write(encodeFrame(header, body)),
    close: () => socket.end(),
    destroy: () => socket.destroy()
  }
  let deadline = null
  const clearDeadline = () => {
    clearTimeout(deadline)
    deadline = null
  }
  socket.setTimeout(IDLE_MS, () => socket.destroy())
  socket.on('data', (chunk) => {
    deadline ??= setTimeout(() => socket.destroy(), FRAME_DEADLINE_MS)
    try {
      for (const frame of reader.push(chunk)) onFrame(frame, conn)
      if (!reader.isMidFrame()) clearDeadline()
    } catch {
      socket.destroy()
    }
  })
  socket.on('error', () => socket.destroy())
  socket.on('close', clearDeadline)
  return conn
}

function listenOne(address, port, onSocket) {
  return new Promise((resolve, reject) => {
    const server = net.createServer({ pauseOnConnect: true }, (socket) => {
      if (!isPrivateAddress(socket.remoteAddress)) return socket.destroy()
      onSocket(socket)
      socket.resume()
    })
    server.maxConnections = MAX_CONNECTIONS
    server.once('error', reject)
    server.listen({ host: address, port, exclusive: true }, () => resolve(server))
  })
}

export async function listenOnPrivate(addresses, { onFrame, onClose, accept }) {
  const servers = []
  const sockets = new Set()
  const admission = createAdmission()
  let port = 0
  const handle = (socket) => {
    const remote = socket.remoteAddress
    if (!admission.admit(remote)) return socket.destroy()
    sockets.add(socket)
    const conn = wrapSocket(socket, onFrame, accept)
    socket.on('close', () => {
      admission.release(remote)
      sockets.delete(socket)
      onClose?.(conn)
    })
  }
  for (const address of addresses) {
    try {
      const server = await listenOne(address, port, handle)
      port = server.address().port
      servers.push(server)
    } catch {
      continue
    }
  }
  return {
    port: servers.length ? port : null,
    close: () => {
      for (const socket of sockets) socket.destroy()
      return Promise.all(servers.map((s) => new Promise((done) => s.close(() => done()))))
    }
  }
}

export function connectTo({ address, port }, { onFrame, onClose }) {
  return new Promise((resolve, reject) => {
    if (!isPrivateAddress(address)) return reject(new Error('not-private'))
    const socket = net.connect({ host: address, port })
    socket.once('connect', () => {
      const conn = wrapSocket(socket, onFrame)
      socket.on('close', () => onClose?.(conn))
      resolve(conn)
    })
    socket.once('error', reject)
  })
}
