import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  GIT_TOOL_NAME,
  TEMP_PREFIX,
  TEMP_TTL_MS,
  gitToolScript,
  gitToolStatus,
  gitToolTarget,
  registerArgs,
  registerGitTool,
  runGit,
  sweepGitTemp,
  unregisterArgs,
  unregisterGitTool
} from '../../src/main/gitTool'
import { gitMergeScript } from '../../src/main/gitMergeTool'

const APP = '/Applications/Diff Bro.app/Contents/MacOS/Diff Bro'
// Windows has no exec bit to set or read — registerGitTool already skips the
// chmod there. The path and git-config assertions still run everywhere.
const POSIX_HOST = process.platform !== 'win32'
let home

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'diffbro-git-tool-'))
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

// A fake git: records every invocation and answers `--get` from a config map.
function fakeGit(config = {}, { available = true } = {}) {
  const calls = []
  const git = async (args) => {
    calls.push(args)
    if (args[0] === '--version') return { ok: available, stdout: 'git version 2.43.0' }
    if (!available) return { ok: false, stdout: '' }
    if (args.includes('--get')) {
      const key = args[args.length - 1]
      return { ok: key in config, stdout: config[key] ?? '' }
    }
    if (args.includes('--unset')) {
      const key = args[args.length - 1]
      const had = key in config
      delete config[key]
      return { ok: had, stdout: '' }
    }
    if (args.includes('--remove-section')) return { ok: true, stdout: '' }
    config[args[2]] = args[3]
    return { ok: true, stdout: '' }
  }
  return { git, calls, config }
}

describe('gitToolTarget', () => {
  it('sits beside the diffbro shim on unix', () => {
    expect(gitToolTarget({ platform: 'darwin', home: '/Users/x' })).toBe(
      '/Users/x/.local/bin/diffbro-git'
    )
  })

  it('goes under LOCALAPPDATA on windows', () => {
    const t = gitToolTarget({
      platform: 'win32',
      home: 'C:\\Users\\x',
      localAppData: 'C:\\AppData'
    })
    expect(t).toContain('AppData')
    expect(t).toMatch(/diffbro-git$/)
  })
})

describe('gitToolScript', () => {
  // git deletes $LOCAL/$REMOTE the instant the command returns, and the launch
  // returns immediately (single-instance). Without its own copies the app would
  // be pointed at two files that no longer exist.
  it('copies both sides out of git’s temp dir before launching', () => {
    const s = gitToolScript(APP)
    expect(s).toMatch(/^#!\/bin\/sh/)
    expect(s).toContain(`mktemp -d "${'${TMPDIR:-/tmp}'}/${TEMP_PREFIX}XXXXXX"`)
    expect(s).toContain('cp -- "$1" "$dir/before/$name"')
    expect(s).toContain('cp -- "$2" "$dir/after/$name"')
    expect(s).toContain(`exec '${APP}' difftool "$dir/before/$name" "$dir/after/$name"`)
  })

  // The copies keep the repo's filename, so the comparison is labelled
  // "config.json", never git's random temp name.
  it('names the copies after the path in the repo', () => {
    expect(gitToolScript(APP)).toContain('name=${3##*/}')
  })
})

describe('registerArgs', () => {
  it('defines both tools and makes them the default', () => {
    const keys = registerArgs('/bin/diffbro-git').map((a) => a[2])
    expect(keys).toEqual([
      `difftool.${GIT_TOOL_NAME}.cmd`,
      `mergetool.${GIT_TOOL_NAME}.cmd`,
      `mergetool.${GIT_TOOL_NAME}.trustExitCode`,
      'diff.tool',
      'merge.tool'
    ])
  })

  it('passes both sides and the repo path to the launcher', () => {
    const cmd = registerArgs('/bin/diffbro-git')[0][3]
    expect(cmd).toBe('"/bin/diffbro-git" "$LOCAL" "$REMOTE" "$MERGED"')
  })

  // This USED to be false, because Diff Bro never wrote $MERGED and a trusted
  // exit code would have marked a conflict resolved just because the viewer
  // closed. It writes the file now, and the merge launcher WAITS for that write
  // before exiting — so a clean exit means resolved, and git may believe it.
  it('lets git trust the exit code, because the merge launcher waits', () => {
    const trust = registerArgs('/x', '/x-merge').find((a) => a[2].endsWith('trustExitCode'))
    expect(trust[3]).toBe('true')
  })

  it('points the mergetool at the waiting launcher, not the difftool one', () => {
    const args = registerArgs('/bin/diffbro-git', '/bin/diffbro-git-merge')
    const merge = args.find((a) => a[2] === `mergetool.${GIT_TOOL_NAME}.cmd`)
    expect(merge[3]).toBe('"/bin/diffbro-git-merge" "$LOCAL" "$REMOTE" "$MERGED"')
  })

  // The wait is the whole reason trustExitCode may be true; a launcher that
  // returned straight away would hand git a lie. It watches a SENTINEL rather
  // than $MERGED itself: a resolution that writes the same bytes back changes
  // neither size nor timestamp, and `ls -l` only resolves to the minute.
  it('waits for the app to say what it did', () => {
    const script = gitMergeScript('/Applications/Diff Bro.app/x')
    expect(script).toContain('mergetool')
    expect(script).toContain('done_file="$3.diffbro-merge-done"')
    expect(script).toContain('while [ ! -f "$done_file" ]')
  })

  // Declining is an answer, and it must not be read as a resolution.
  it('fails when the reader cancelled, and succeeds only on a write', () => {
    const script = gitMergeScript('/x')
    expect(script).toContain('[ "$verdict" = "written" ] || exit 1')
  })

  // A window closed and forgotten must not hold the terminal for ever.
  it('gives up rather than waiting without end', () => {
    expect(gitMergeScript('/x')).toMatch(/waited" -lt \d+/)
  })
})

describe('unregisterArgs', () => {
  it('drops both tool sections', () => {
    const args = unregisterArgs({})
    expect(args.map((a) => a[3])).toEqual([
      `difftool.${GIT_TOOL_NAME}`,
      `mergetool.${GIT_TOOL_NAME}`
    ])
  })

  it('clears diff.tool and merge.tool when they still name us', () => {
    const args = unregisterArgs({ diffTool: GIT_TOOL_NAME, mergeTool: GIT_TOOL_NAME })
    expect(args.filter((a) => a.includes('--unset')).map((a) => a[3])).toEqual([
      'diff.tool',
      'merge.tool'
    ])
  })

  // Someone else's default is not ours to remove.
  it('leaves another tool’s default alone', () => {
    const args = unregisterArgs({ diffTool: 'meld', mergeTool: 'kdiff3' })
    expect(args.some((a) => a.includes('--unset'))).toBe(false)
  })
})

describe('registerGitTool', () => {
  it('writes an executable launcher and configures git', async () => {
    const { git, config } = fakeGit()
    const res = await registerGitTool({ exePath: APP, home, platform: 'darwin', git })
    expect(res.ok).toBe(true)

    const target = gitToolTarget({ platform: 'darwin', home })
    expect(readFileSync(target, 'utf8')).toContain(APP)
    if (POSIX_HOST) expect(statSync(target).mode & 0o111).toBeTruthy()
    expect(config[`difftool.${GIT_TOOL_NAME}.cmd`]).toContain(target)
    expect(config['diff.tool']).toBe(GIT_TOOL_NAME)
  })

  it('reports when git is not installed instead of writing anything', async () => {
    const { git } = fakeGit({}, { available: false })
    const res = await registerGitTool({ exePath: APP, home, platform: 'darwin', git })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/git/i)
  })

  // Same rule the CLI shim follows: never clobber a file we did not write.
  it('refuses to overwrite someone else’s diffbro-git', async () => {
    const target = gitToolTarget({ platform: 'darwin', home })
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    writeFileSync(target, '#!/bin/sh\necho not ours\n')
    const { git } = fakeGit()
    const res = await registerGitTool({ exePath: APP, home, platform: 'darwin', git })
    expect(res.ok).toBe(false)
    expect(readFileSync(target, 'utf8')).toContain('not ours')
  })
})

describe('unregisterGitTool', () => {
  it('removes the launcher and the git configuration', async () => {
    const { git, config } = fakeGit()
    await registerGitTool({ exePath: APP, home, platform: 'darwin', git })
    const target = gitToolTarget({ platform: 'darwin', home })

    const res = await unregisterGitTool({ home, platform: 'darwin', git })
    expect(res.ok).toBe(true)
    expect(() => statSync(target)).toThrow()
    expect(config['diff.tool']).toBeUndefined()
  })

  it('keeps a foreign default difftool', async () => {
    const { git, config } = fakeGit({ 'diff.tool': 'meld' })
    await unregisterGitTool({ home, platform: 'darwin', git })
    expect(config['diff.tool']).toBe('meld')
  })
})

describe('gitToolStatus', () => {
  it('is registered only when git points at the launcher we wrote', async () => {
    const { git } = fakeGit()
    expect((await gitToolStatus({ home, platform: 'darwin', git })).registered).toBe(false)
    await registerGitTool({ exePath: APP, home, platform: 'darwin', git })
    expect((await gitToolStatus({ home, platform: 'darwin', git })).registered).toBe(true)
  })

  // A registration pointing at some other tool's command is not ours.
  it('is not registered when the command names a different tool', async () => {
    const { git } = fakeGit({ [`difftool.${GIT_TOOL_NAME}.cmd`]: '"/usr/bin/meld" "$LOCAL"' })
    expect((await gitToolStatus({ home, platform: 'darwin', git })).registered).toBe(false)
  })

  it('reports git missing', async () => {
    const { git } = fakeGit({}, { available: false })
    expect((await gitToolStatus({ home, platform: 'darwin', git })).available).toBe(false)
  })
})

describe('sweepGitTemp', () => {
  it('removes only our own stale directories', () => {
    const old = join(home, `${TEMP_PREFIX}old`)
    const fresh = join(home, `${TEMP_PREFIX}fresh`)
    const foreign = join(home, 'someone-elses-temp')
    for (const d of [old, fresh, foreign]) mkdirSync(join(d, 'before'), { recursive: true })
    const past = (Date.now() - TEMP_TTL_MS - 60_000) / 1000
    utimesSync(old, past, past)
    utimesSync(foreign, past, past)

    expect(sweepGitTemp(home)).toBe(1)
    expect(() => statSync(old)).toThrow()
    expect(statSync(fresh).isDirectory()).toBe(true)
    expect(statSync(foreign).isDirectory()).toBe(true)
  })

  it('is harmless when the directory does not exist', () => {
    expect(sweepGitTemp(join(home, 'nope'))).toBe(0)
  })
})

describe('runGit', () => {
  // The default runner. It RESOLVES rather than rejects on a non-zero exit,
  // because `git config --unset` on a key that is not set exits 5 — a no-op,
  // not a failure, and treating it as one would abort the unregister halfway.
  it('resolves with ok=false instead of throwing on a failed invocation', async () => {
    const res = await runGit(['config', '--global', '--get', 'diffbro.almost.certainly.unset'])
    expect(res.ok).toBe(false)
    expect(res.stdout).toBe('')
  })

  it('reports success and trimmed output for a real invocation', async () => {
    const res = await runGit(['--version'])
    expect(res.ok).toBe(true)
    expect(res.stdout).toMatch(/^git version/)
  })

  it('resolves rather than throwing when the binary is missing', async () => {
    const res = await runGit(['--this-flag-does-not-exist'])
    expect(res.ok).toBe(false)
  })
})

describe('registerGitTool — failure paths', () => {
  // A file where the home directory should be: writing under it fails with
  // ENOTDIR everywhere. /proc looked unwritable on every platform and is not —
  // on Linux a recursive mkdir into procfs never returns (see autoBackup.test).
  it('reports the fs error rather than throwing when the target is unwritable', async () => {
    const { git } = fakeGit()
    const blocker = join(home, 'not-a-directory')
    writeFileSync(blocker, 'x')
    const res = await registerGitTool({
      exePath: APP,
      home: join(blocker, 'nested'),
      platform: 'darwin',
      git
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('reports when git refuses the configuration', async () => {
    const git = async (args) =>
      args[0] === '--version' ? { ok: true, stdout: 'git' } : { ok: false, stdout: '' }
    const res = await registerGitTool({ exePath: APP, home, platform: 'darwin', git })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/refused/i)
  })
})

// The same dev-run trap the CLI shim had: unpackaged, `app.getPath('exe')` is
// Electron, so `exec .../Electron difftool …` makes Electron read `difftool` as
// the path of an app to launch. The entry point has to travel with it.
describe('gitToolScript — registered from a dev run', () => {
  const ELECTRON = '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'

  it('passes the app entry point so the verb is not read as one', () => {
    expect(gitToolScript(ELECTRON, '/repo')).toContain(`exec '${ELECTRON}' '/repo' difftool`)
  })

  it('leaves a packaged script exactly as it was', () => {
    const packaged = '/Applications/Diff Bro.app/Contents/MacOS/Diff Bro'
    expect(gitToolScript(packaged)).toContain(`exec '${packaged}' difftool`)
    expect(gitToolScript(packaged, null)).toContain(`exec '${packaged}' difftool`)
  })
})
