import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { bundlePathOf, forwardLaunchesToGui } from '../../src/main/mcpHandover'

const EXEC = '/Applications/Diff Bro.app/Contents/MacOS/Diff Bro'

function fakeApp() {
  const app = new EventEmitter()
  app.dock = { hide: vi.fn() }
  return app
}

describe('bundlePathOf', () => {
  it('finds the .app a packaged executable lives in', () => {
    expect(bundlePathOf(EXEC)).toBe('/Applications/Diff Bro.app')
  })

  it('has no bundle for a bare binary', () => {
    expect(bundlePathOf('/usr/local/bin/electron')).toBeNull()
  })
})

describe('forwardLaunchesToGui', () => {
  it('starts a separate GUI when macOS re-opens the MCP process', () => {
    const app = fakeApp()
    const launch = vi.fn()
    forwardLaunchesToGui({ app, execPath: EXEC, launch })
    app.emit('activate')
    expect(launch).toHaveBeenCalledWith('/usr/bin/open', ['-n', '-a', '/Applications/Diff Bro.app'])
  })

  it('goes back to the background after handing over', () => {
    const app = fakeApp()
    forwardLaunchesToGui({ app, execPath: EXEC, launch: vi.fn() })
    app.emit('activate')
    expect(app.dock.hide).toHaveBeenCalled()
  })

  it('hands files opened with the app over as one launch', () => {
    vi.useFakeTimers()
    const app = fakeApp()
    const launch = vi.fn()
    const preventDefault = vi.fn()
    forwardLaunchesToGui({ app, execPath: EXEC, launch })
    app.emit('open-file', { preventDefault }, '/a.txt')
    app.emit('open-file', { preventDefault }, '/b.txt')
    vi.runAllTimers()
    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(launch.mock.calls).toEqual([
      ['/usr/bin/open', ['-n', '-a', '/Applications/Diff Bro.app', '--args', '/a.txt', '/b.txt']]
    ])
    vi.useRealTimers()
  })

  it('does nothing outside an app bundle', () => {
    const app = fakeApp()
    const launch = vi.fn()
    forwardLaunchesToGui({ app, execPath: '/usr/local/bin/electron', launch })
    app.emit('activate')
    expect(launch).not.toHaveBeenCalled()
  })
})
