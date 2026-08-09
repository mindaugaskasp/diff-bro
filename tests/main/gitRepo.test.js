import { describe, expect, it } from 'vitest'
import {
  gitEnv,
  HARDENING,
  isSafeRevision,
  readBlobArgs,
  repoRootArgs,
  resolveRevisionArgs
} from '../../src/main/gitRepo'

describe('isSafeRevision', () => {
  it('takes the revision shapes a reader actually types', () => {
    for (const rev of [
      'HEAD',
      'HEAD~3',
      'HEAD^',
      'main',
      'origin/main',
      'feature/a-b_c',
      'v1.2.3',
      '9a73b33',
      '9a73b33cd1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8',
      'HEAD@{1}',
      'release-2024.10'
    ]) {
      expect(isSafeRevision(rev), rev).toBe(true)
    }
  })

  // A revision reaches argv. Anything that could be read as an OPTION is the
  // one shape that must never get through, however harmless it looks.
  it('refuses anything that could be read as an option', () => {
    for (const rev of ['--upload-pack=evil', '-c', '--exec=sh', '-']) {
      expect(isSafeRevision(rev), rev).toBe(false)
    }
  })

  it('refuses shell metacharacters and whitespace', () => {
    for (const rev of ['HEAD; rm -rf /', 'HEAD|cat', 'HEAD$(id)', 'HEAD `id`', 'a b', 'HEAD\n']) {
      expect(isSafeRevision(rev), rev).toBe(false)
    }
  })

  it('refuses nothing, a non-string, and an absurd length', () => {
    expect(isSafeRevision('')).toBe(false)
    expect(isSafeRevision(null)).toBe(false)
    expect(isSafeRevision(42)).toBe(false)
    expect(isSafeRevision('a'.repeat(256))).toBe(false)
  })
})

describe('the hardening every invocation carries', () => {
  // A repository is untrusted input: its own config has been an execution vector
  // before. These are the flags that stop a clone running anything.
  it('disables hooks, the fsmonitor and any pager', () => {
    expect(HARDENING).toContain('-c')
    expect(HARDENING.join(' ')).toContain('core.hooksPath=')
    expect(HARDENING.join(' ')).toContain('core.fsmonitor=')
    expect(HARDENING).toContain('--no-pager')
  })
})

describe('argument vectors', () => {
  it('asks for the repo root, hardened', () => {
    const args = repoRootArgs()
    expect(args.slice(0, HARDENING.length)).toEqual(HARDENING)
    expect(args).toContain('rev-parse')
    expect(args).toContain('--show-toplevel')
  })

  it('resolves a revision to a commit, hardened', () => {
    const args = resolveRevisionArgs('HEAD~2')
    expect(args.slice(0, HARDENING.length)).toEqual(HARDENING)
    expect(args).toEqual([
      ...HARDENING,
      'rev-parse',
      '--verify',
      '--end-of-options',
      'HEAD~2^{commit}'
    ])
  })

  // `--` is what stops a path called `-x` becoming a flag, and `git show` takes
  // the pair as ONE argument, so the path cannot be split off either.
  it('reads a blob with the revision and path fenced apart', () => {
    const args = readBlobArgs('HEAD', 'src/main/index.js')
    expect(args).toEqual([...HARDENING, 'show', '--end-of-options', 'HEAD:src/main/index.js'])
  })

  it('normalises a Windows path separator, because git only speaks posix', () => {
    expect(readBlobArgs('HEAD', 'src\\main\\index.js')).toContain('HEAD:src/main/index.js')
  })

  it('refuses to build anything from a revision it would not accept', () => {
    expect(() => resolveRevisionArgs('--upload-pack=evil')).toThrow()
    expect(() => readBlobArgs('-c', 'a.js')).toThrow()
  })

  it('refuses a path that climbs out of the repository', () => {
    expect(() => readBlobArgs('HEAD', '../../etc/passwd')).toThrow()
    expect(() => readBlobArgs('HEAD', '/etc/passwd')).toThrow()
  })
})

// GIT_DIR, GIT_INDEX_FILE, GIT_ALTERNATE_OBJECT_DIRECTORIES and friends all
// redirect git at something other than the repository main chose. Inheriting the
// launching shell's environment wholesale hands that redirect to whoever set it.
describe('the environment a git invocation inherits', () => {
  it('drops every GIT_ variable it was launched with', () => {
    const env = gitEnv({ PATH: '/usr/bin', GIT_DIR: '/tmp/evil.git', GIT_INDEX_FILE: '/tmp/i' })
    expect(env.GIT_DIR).toBeUndefined()
    expect(env.GIT_INDEX_FILE).toBeUndefined()
  })

  it('keeps what git needs to run at all', () => {
    const env = gitEnv({ PATH: '/usr/bin', HOME: '/home/x', SystemRoot: 'C:\\Windows' })
    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/home/x')
    expect(env.SystemRoot).toBe('C:\\Windows')
  })

  it('sets the two that make it non-interactive and system-config free', () => {
    const env = gitEnv({})
    expect(env.GIT_CONFIG_NOSYSTEM).toBe('1')
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
  })
})
