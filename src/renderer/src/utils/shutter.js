// The camera-shutter cue for an image export. Synthesised rather than shipped:
// a bundled clip would be a binary asset to license and carry, and the sound is
// two filtered noise bursts — the mirror going up and the curtain closing.
//
// Nothing here reaches the network (there is nothing to fetch), and the Web
// Audio API is the platform's, not a dependency.

// A real SLR is a sharp clack, a beat, then a softer one.
export const SHUTTER = {
  clicks: [
    { at: 0, gain: 0.16, ms: 14, hz: 2400 },
    { at: 0.085, gain: 0.1, ms: 22, hz: 1500 }
  ],
  // Long enough for both clicks and their tails; the context closes after.
  totalMs: 260
}

// White noise is the body of the click; the bandpass gives it a snap rather
// than a hiss, and the envelope decays fast enough not to ring.
function click(ctx, { at, gain, ms, hz }) {
  const frames = Math.max(1, Math.round((ctx.sampleRate * ms) / 1000))
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) {
    // Linear decay across the burst — a click, not a swell.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer

  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = hz
  band.Q.value = 0.8

  const level = ctx.createGain()
  const start = ctx.currentTime + at
  level.gain.setValueAtTime(gain, start)
  level.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000)

  source.connect(band).connect(level).connect(ctx.destination)
  source.start(start)
  return source
}

/**
 * Play the shutter. Silent and harmless wherever Web Audio is unavailable —
 * the cue is decoration, never something a capture waits on.
 * @param {{ AudioCtx?: Function, enabled?: boolean }} [opts]
 * @returns {boolean} whether a sound was actually scheduled
 */
export function playShutter({ AudioCtx = globalThis.AudioContext, enabled = true } = {}) {
  if (!enabled || typeof AudioCtx !== 'function') return false
  let ctx
  try {
    ctx = new AudioCtx()
    for (const spec of SHUTTER.clicks) click(ctx, spec)
    // One context per shot, released once the tail has played: holding one open
    // keeps an audio device awake for a sound used once in a while.
    setTimeout(() => ctx.close?.(), SHUTTER.totalMs)
    return true
  } catch {
    ctx?.close?.()
    return false
  }
}
