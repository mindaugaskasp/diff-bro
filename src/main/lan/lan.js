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

function announcement(ctx, ttl) {
  const { settings, server, selfFp } = ctx
  return settings.visible && server?.port
    ? encodeAnnouncement({ fp: selfFp, name: settings.name, port: server.port, ttl })
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
    accept: (header) => (ctx.acceptors.get(header.type) ?? (() => true))(header)
  })
  ctx.discovery = await createDiscovery({
    addresses: ctx.addresses,
    announcement: () => announcement(ctx),
    onPeer: (peer) => ctx.peers.saw(peer, ctx.now()) && ctx.onChange()
  }).catch(() => null)
  ctx.discovery?.announce()
  ctx.discovery?.query()
}

async function close(ctx) {
  const goodbye = announcement(ctx, 0)
  if (goodbye) await ctx.discovery?.sendRaw(goodbye)
  await ctx.discovery?.close()
  await ctx.server?.close()
  Object.assign(ctx, { discovery: null, server: null, addresses: [] })
  ctx.peers.clear()
}

async function pollInterfaces(ctx) {
  if (ipv4Addresses().join() === ctx.addresses.join()) return
  await close(ctx)
  await open(ctx)
  ctx.onChange()
}

function startTimers(ctx) {
  ctx.timers = [
    setInterval(() => ctx.discovery?.announce(), REANNOUNCE_MS),
    setInterval(() => ctx.peers.expire(ctx.now()) && ctx.onChange(), EXPIRE_MS),
    setInterval(() => pollInterfaces(ctx).catch(() => {}), INTERFACE_POLL_MS)
  ]
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
    const goodbye = announcement({ ...ctx, settings: before }, 0)
    if (goodbye) await ctx.discovery?.sendRaw(goodbye)
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

export function createLan({ settings, selfFp, onChange, now = Date.now }) {
  const ctx = {
    settings,
    selfFp,
    onChange,
    now,
    handlers: new Map(),
    acceptors: new Map(),
    addresses: [],
    server: null,
    discovery: null,
    peers: createPeerTable({ self: selfFp }),
    timers: []
  }
  return {
    start: () => start(ctx),
    stop: () => stop(ctx),
    apply: (next) => apply(ctx, next),
    on: (type, handler) => ctx.handlers.set(type, handler),
    accept: (type, check) => ctx.acceptors.set(type, check),
    endpointOf: (fp) => ctx.peers.endpointOf(fp),
    peers: () => ctx.peers.list(),
    isOnline: () => ctx.addresses.length > 0,
    settings: () => ctx.settings
  }
}
