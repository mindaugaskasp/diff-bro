import { describe, expect, it } from 'vitest'
import { isDebugLaunch } from '../../src/main/launchGuard'

const switches =
  (...names) =>
  (name) =>
    names.includes(name)

describe('isDebugLaunch', () => {
  it.each(['remote-debugging-port', 'remote-debugging-pipe'])(
    'flags a launch with --%s: it hands the renderer, and window.api, to whoever connects',
    (name) => expect(isDebugLaunch(switches(name))).toBe(true)
  )

  it('lets an ordinary launch through', () => {
    expect(isDebugLaunch(switches('user-data-dir', 'hidden'))).toBe(false)
  })
})
