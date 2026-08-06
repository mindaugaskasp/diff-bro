import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { eslintJsonCommand } from '../../scripts/lib/eslintRun.mjs'

// `npx` is `npx.cmd` on Windows, and execFileSync cannot spawn a .cmd without a
// shell. The spawn failed, the catch read `err.stdout` (undefined on a spawn
// error, not an eslint exit) and the whole release died on
// `SyntaxError: "undefined" is not valid JSON` — which named neither npx nor
// eslint. Only the release build runs `npm run check` on Windows, so nothing
// caught it earlier.
describe('eslintJsonCommand', () => {
  const cmd = () => eslintJsonCommand({ config: 'eslint.i18n.mjs', targets: ['src/renderer/src'] })

  it('spawns node itself, not a shell wrapper', () => {
    expect(cmd().command).toBe(process.execPath)
  })

  it('never goes through npx, which is a .cmd on Windows', () => {
    const { command, args } = cmd()
    expect([command, ...args].some((p) => /npx/.test(p))).toBe(false)
  })

  it('points at an eslint entry script that actually exists', () => {
    const entry = cmd().args[0]
    expect(entry).toMatch(/eslint[\\/]bin[\\/]eslint\.js$/)
    expect(existsSync(entry)).toBe(true)
  })

  it('keeps the flags the guard depends on, and its targets', () => {
    const { args } = cmd()
    expect(args).toContain('--no-config-lookup')
    expect(args).toContain('eslint.i18n.mjs')
    expect(args).toContain('src/renderer/src')
    expect(args[args.indexOf('-f') + 1]).toBe('json')
  })
})
