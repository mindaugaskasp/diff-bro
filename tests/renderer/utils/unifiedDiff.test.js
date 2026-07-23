import { describe, expect, it } from 'vitest'
import { toUnifiedDiff, MAX_DIFF_LINES } from '../../../src/renderer/src/utils/unifiedDiff'

describe('toUnifiedDiff', () => {
  it('returns an empty patch for identical sides', () => {
    expect(toUnifiedDiff('same\ntext\n', 'same\ntext\n')).toEqual({ patch: '' })
  })

  it('emits a git-style hunk for a one-line modification', () => {
    const res = toUnifiedDiff('one\ntwo\nthree\n', 'one\nTWO\nthree\n', {
      leftLabel: 'a.txt',
      rightLabel: 'b.txt'
    })
    expect(res.patch).toBe('--- a.txt\n+++ b.txt\n@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n')
  })

  it('represents a file created from empty as -0,0', () => {
    const res = toUnifiedDiff('', 'x\ny\n')
    expect(res.patch).toBe('--- original\n+++ changed\n@@ -0,0 +1,2 @@\n+x\n+y\n')
  })

  it('represents a pure deletion', () => {
    const res = toUnifiedDiff('keep\ndrop\nkeep2\n', 'keep\nkeep2\n')
    expect(res.patch).toContain('@@ -1,3 +1,2 @@')
    expect(res.patch).toContain('-drop')
  })

  it('appends a trailing addition without a phantom empty line', () => {
    const res = toUnifiedDiff('a\nb\n', 'a\nb\nc\n')
    // Only one added line (c) in the hunk body; no spurious blank line from the
    // trailing "\n". (Slice past the '+++' header so it isn't miscounted.)
    const body = res.patch.slice(res.patch.indexOf('@@'))
    expect((body.match(/^\+/gm) || []).length).toBe(1)
    expect(res.patch).toContain('+c')
  })

  it('splits changes that are far apart into separate hunks', () => {
    const left = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n')
    const right = left.replace('line1\n', 'X1\n').replace('\nline20', '\nX20')
    const res = toUnifiedDiff(left, right)
    expect((res.patch.match(/^@@ /gm) || []).length).toBe(2)
  })

  it('keeps nearby changes in a single hunk', () => {
    const left = 'a\nb\nc\nd\ne\n'
    const right = 'a\nB\nc\nD\ne\n' // two changes two lines apart -> one hunk
    const res = toUnifiedDiff(left, right)
    expect((res.patch.match(/^@@ /gm) || []).length).toBe(1)
  })

  it('guards against oversized inputs', () => {
    const big = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `l${i}`).join('\n')
    expect(toUnifiedDiff(big, 'x')).toEqual({ error: 'too-large' })
    expect(toUnifiedDiff('x', big)).toEqual({ error: 'too-large' })
  })

  it('line counts in the header match the hunk body', () => {
    const res = toUnifiedDiff('a\nb\nc\nd\n', 'a\nX\nc\nd\n')
    const header = res.patch.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/)
    const [, , oldCount, , newCount] = header.map(Number)
    const body = res.patch.slice(res.patch.indexOf('@@'))
    const oldLines = (body.match(/^[ -]/gm) || []).length
    const newLines = (body.match(/^[ +]/gm) || []).length
    // The @@ header line itself starts with '@', not counted by [ -]/[ +].
    expect(oldLines).toBe(oldCount)
    expect(newLines).toBe(newCount)
  })
})
