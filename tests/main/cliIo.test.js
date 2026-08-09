// The terminal half of `create snippet --interactive`, driven over a fake TTY.
//
// It needs a REAL readline interface: a Tab is only decoded into a completion
// when readline reads the byte itself, so nothing about this guard is reachable
// through the io that promptSnippet's own tests inject. That is exactly how a
// permanently-installed completer shipped, silently eating every tab typed into
// a snippet body.
import { describe, expect, it } from 'vitest'
import { PassThrough } from 'node:stream'
import { defaultIo } from '../../src/main/cliIo'

const NAMES = ['Deploy — prod', 'Deploy — dev', 'Sendbird stuff']

// Per keystroke, not in one write: a whole line arriving at once bypasses
// readline's key decoding, and a Tab in it survives however the completer is
// wired — which makes a chunked test pass against the broken version.
const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

function tty() {
  const input = new PassThrough()
  const output = new PassThrough()
  input.isTTY = true
  output.isTTY = true
  output.columns = 80
  output.resume()
  return { input, output }
}

async function typed(io, input, keys) {
  const answer = io.ask('', arguments[3])
  for (const key of keys) {
    input.write(key)
    await tick()
  }
  return answer
}

describe('defaultIo — name completion', () => {
  it('completes to the head every match shares, and no further', async () => {
    const { input, output } = tty()
    const io = defaultIo({ names: () => NAMES, input, output })
    const answer = await typed(io, input, ['D', 'e', 'p', '\t', '\n'], { completes: true })
    io.close()
    expect(answer).toBe('Deploy — ')
  })

  it('completes a single match in full, whatever case was typed', async () => {
    const { input, output } = tty()
    const io = defaultIo({ names: () => NAMES, input, output })
    const answer = await typed(io, input, ['s', 'e', 'n', '\t', '\n'], { completes: true })
    io.close()
    expect(answer).toBe('Sendbird stuff')
  })

  it('leaves a line nothing matches alone', async () => {
    const { input, output } = tty()
    const io = defaultIo({ names: () => NAMES, input, output })
    const answer = await typed(io, input, ['z', 'z', '\t', '\n'], { completes: true })
    io.close()
    expect(answer).toBe('zz')
  })
})

describe('defaultIo — a Tab outside the name question', () => {
  // The body is snippet text: a tab is a tab. readline inserts one only when
  // there is NO completer, so the completer has to be uninstalled, not gated.
  it('keeps a typed tab in a question that did not ask to complete', async () => {
    const { input, output } = tty()
    const io = defaultIo({ names: () => NAMES, input, output })
    const answer = await typed(io, input, ['a', '\t', 'b', '\n'])
    io.close()
    expect(answer).toBe('a\tb')
  })

  it('keeps a leading tab, on the same reader the name question used', async () => {
    const { input, output } = tty()
    const io = defaultIo({ names: () => NAMES, input, output })
    await typed(io, input, ['D', 'e', 'p', '\t', '\n'], { completes: true })
    const body = await typed(io, input, ['\t', 'i', 'n', 'd', 'e', 'n', 't', '\n'])
    io.close()
    expect(body).toBe('\tindent')
  })
})

describe('defaultIo — the library it completes against', () => {
  it('is not read at all until the name question asks for it', async () => {
    let reads = 0
    const { input, output } = tty()
    const io = defaultIo({
      names: () => {
        reads++
        return NAMES
      },
      input,
      output
    })
    expect(reads).toBe(0)
    expect(io.hasNames()).toBe(true)
    expect(io.hasNames()).toBe(true)
    io.close()
    expect(reads).toBe(1)
  })

  it('says it has none when the library is empty, so the hint can stay quiet', () => {
    const { input, output } = tty()
    const io = defaultIo({ names: () => [], input, output })
    expect(io.hasNames()).toBe(false)
    io.close()
  })
})
