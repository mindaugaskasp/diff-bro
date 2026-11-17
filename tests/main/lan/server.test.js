import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FRAME_DEADLINE_MS,
  MAX_PER_REMOTE,
  createAdmission,
  wrapSocket
} from '../../../src/main/lan/server'

function fakeSocket() {
  const socket = new EventEmitter()
  Object.assign(socket, {
    remoteAddress: '192.168.1.66',
    setTimeout: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn()
  })
  return socket
}

describe('a slow sender', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is cut off when one frame takes too long, however steadily it trickles', () => {
    const socket = fakeSocket()
    wrapSocket(socket, () => {})
    for (let t = 0; t < FRAME_DEADLINE_MS + 10_000; t += 5_000) {
      socket.emit('data', Buffer.from([0]))
      vi.advanceTimersByTime(5_000)
    }
    expect(socket.destroy).toHaveBeenCalled()
  })

  it('is left alone between frames', () => {
    const socket = fakeSocket()
    wrapSocket(socket, () => {})
    vi.advanceTimersByTime(FRAME_DEADLINE_MS * 2)
    expect(socket.destroy).not.toHaveBeenCalled()
  })
})

describe('connections per address', () => {
  it('admits a few from one address and leaves room for everyone else', () => {
    const admission = createAdmission()
    for (let i = 0; i < MAX_PER_REMOTE; i++) expect(admission.admit('192.168.1.66')).toBe(true)
    expect(admission.admit('192.168.1.66')).toBe(false)
    expect(admission.admit('192.168.1.5')).toBe(true)
    admission.release('192.168.1.66')
    expect(admission.admit('192.168.1.66')).toBe(true)
  })
})
