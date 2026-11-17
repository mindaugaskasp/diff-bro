import { networkInterfaces } from 'os'
import { createDiscovery } from './discovery'
import { encodeAnnouncement } from './dnsSd'
import { createPeerTable } from './peers'
import { privateInterfaceAddresses } from './privateAddress'
import { listenOnPrivate } from './server'

const REANNOUNCE_MS = 60_000
const EXPIRE_MS = 10_000
const INTERFACE_POLL_MS = 5_000

const ipv4Addresses = () =>
  privateInterfaceAddresses(networkInterfaces())
    .filter((a) => a.family === 'IPv4' || a.family === 4)
    .map((a) => a.address)

function announcement(ctx, ttl, addr) {
  const { settings, server, selfFp } = ctx
  return settings.visible && server?.port
    ? encodeAnnouncement({ fp: selfFp, name: settings.name, port: server.port, ttl, addr })
    : null
}

function onFrame(ctx, frame, conn) {
  const handle = ctx.handlers.get(frame.header.type)
  if (handle) handle(frame, conn)
  else conn.destroy()
}

async function open(ctx) {
  ctx.addresses = ipv4Addresses()
  if (!ctx.addresses.length) return
  ctx.server = await listenOnPrivate(ctx.addresses, {
    onFrame: (f, c) => onFrame(ctx, f, c),
    accept: (header) => (ctx.acceptors.get(header.type) ?? (() => true))(header),
    onClose: (c) => ctx.closeHandlers.forEach((handle) => handle(c))
  })
  ctx.discovery = await createDiscovery({
    addresses: ctx.addresses,
    announcement: (addr) => announcement(ctx, undefined, addr),
    onPeer: (peer) => {
      if (!ctx.peers.saw(peer, ctx.now())) return
      ctx.log?.(
        `peer ${peer.fp.slice(0, 8)} at ${peer.address}:${peer.port} (named ${peer.addr ?? 'none'}, sent from ${peer.source})`
      )
      ctx.peerHandlers.forEach((handle) => handle(peer.fp))
      ctx.onChange()
    }
  }).catch(() => null)
  ctx.discovery?.announce()
  ctx.discovery?.query()
}

async function close(ctx) {
  const { discovery, server } = ctx
  Object.assign(ctx, { discovery: null, server: null, addresses: [] })
  ctx.peers.clear()
  try {
    await discovery?.sendEach((addr) => announcement({ ...ctx, discovery, server }, 0, addr))
    await discovery?.close()
  } finally {
    await server?.close()
  }
}

async function pollInterfaces(ctx) {
  if (!ctx.settings.enabled || ipv4Addresses().join() === ctx.addresses.join()) return
  await close(ctx)
  await open(ctx)
  ctx.onChange()
}

function startTimers(ctx) {
  ctx.timers = [
    setInterval(() => ctx.discovery?.announce(), REANNOUNCE_MS),
    setInterval(() => ctx.peers.expire(ctx.now()) && ctx.onChange(), EXPIRE_MS),
    setInterval(() => serially(ctx, () => pollInterfaces(ctx)).catch(() => {}), INTERFACE_POLL_MS)
  ]
}

// Opening awaits; without one queue a quick off can run while the sockets are still opening.
function serially(ctx, task) {
  ctx.queue = ctx.queue.catch(() => {}).then(task)
  return ctx.queue
}

async function start(ctx) {
  if (!ctx.settings.enabled || ctx.server) return
  await open(ctx)
  startTimers(ctx)
  ctx.onChange()
}

async function stop(ctx) {
  ctx.timers.forEach(clearInterval)
  ctx.timers = []
  await close(ctx)
  ctx.onChange()
}

async function toggle(ctx, next) {
  if (!next.enabled) await stop(ctx)
  ctx.settings = next
  return next.enabled ? start(ctx) : ctx.onChange()
}

async function refreshPresence(ctx, before) {
  const { settings } = ctx
  if (before.visible && !settings.visible) {
    await ctx.discovery?.sendEach((addr) => announcement({ ...ctx, settings: before }, 0, addr))
  } else if (settings.visible !== before.visible || settings.name !== before.name) {
    ctx.discovery?.announce()
  }
}

async function apply(ctx, next) {
  const before = ctx.settings
  if (next.enabled !== before.enabled) return toggle(ctx, next)
  ctx.settings = next
  await refreshPresence(ctx, before)
  ctx.onChange()
}

export function createLan({ settings, selfFp, onChange, log, now = Date.now }) {
  const ctx = {
    settings,
    selfFp,
    onChange,
    log,
    now,
    handlers: new Map(),
    acceptors: new Map(),
    closeHandlers: [],
    peerHandlers: [],
    addresses: [],
    server: null,
    discovery: null,
    peers: createPeerTable({ self: selfFp }),
    timers: [],
    queue: Promise.resolve()
  }
  return {
    start: () => serially(ctx, () => start(ctx)),
    stop: () => serially(ctx, () => stop(ctx)),
    apply: (next) => serially(ctx, () => apply(ctx, next)),
    on: (type, handler) => ctx.handlers.set(type, handler),
    accept: (type, check) => ctx.acceptors.set(type, check),
    onClosed: (handler) => ctx.closeHandlers.push(handler),
    onPeerSeen: (handler) => ctx.peerHandlers.push(handler),
    endpointOf: (fp) => ctx.peers.endpointOf(fp),
    peers: () => ctx.peers.list(),
    isOnline: () => ctx.addresses.length > 0,
    settings: () => ctx.settings
  }
}
