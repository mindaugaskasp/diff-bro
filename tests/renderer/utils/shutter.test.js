import { describe, expect, it, vi } from 'vitest'
import { SHUTTER, playShutter } from '../../../src/renderer/src/utils/shutter'

// A stand-in for Web Audio: jsdom has none, and the point of the injection seam
// is that the cue can be checked without one.
function fakeAudio() {
  const started = []
  const closed = { count: 0 }
  const node = () => ({ connect: (next) => next })
  class Ctx {
    constructor() {
      this.sampleRate = 48000
      this.currentTime = 0
      this.destination = node()
    }
    createBuffer(channels, frames, rate) {
      return { channels, frames, rate, getChannelData: () => new Float32Array(frames) }
    }
    createBufferSource() {
      return { buffer: null, connect: (n) => n, start: (at) => started.push(at) }
    }
    createBiquadFilter() {
      return { type: '', frequency: {}, Q: {}, connect: (n) => n }
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: (n) => n
      }
    }
    close() {
      closed.count++
    }
  }
  return { Ctx, started, closed }
}

describe('playShutter', () => {
  it('fires both clicks of the shutter, spaced apart', () => {
    const { Ctx, started } = fakeAudio()
    expect(playShutter({ AudioCtx: Ctx })).toBe(true)
    expect(started).toEqual(SHUTTER.clicks.map((c) => c.at))
    expect(started[1]).toBeGreaterThan(started[0])
  })

  it('stays silent when the cue is switched off', () => {
    const { Ctx, started } = fakeAudio()
    expect(playShutter({ AudioCtx: Ctx, enabled: false })).toBe(false)
    expect(started).toHaveLength(0)
  })

  // The cue is decoration; a platform without Web Audio must not break a capture.
  it('does nothing where Web Audio is unavailable', () => {
    expect(playShutter({ AudioCtx: undefined })).toBe(false)
    expect(playShutter({ AudioCtx: null })).toBe(false)
  })

  it('swallows a context that refuses to start', () => {
    class Broken {
      constructor() {
        throw new Error('no audio device')
      }
    }
    expect(playShutter({ AudioCtx: Broken })).toBe(false)
  })

  // One context per shot, released after the tail — otherwise an audio device
  // is held awake for a sound used once in a while.
  it('closes the context once the sound has played', () => {
    vi.useFakeTimers()
    const { Ctx, closed } = fakeAudio()
    playShutter({ AudioCtx: Ctx })
    expect(closed.count).toBe(0)
    vi.advanceTimersByTime(SHUTTER.totalMs + 10)
    expect(closed.count).toBe(1)
    vi.useRealTimers()
  })
})
