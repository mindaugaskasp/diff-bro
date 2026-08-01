import { describe, expect, it } from 'vitest'
import {
  applyUnifiedDiff,
  toUnifiedDiff,
  MAX_DIFF_LINES
} from '../../../src/renderer/src/utils/unifiedDiff'

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

describe('applyUnifiedDiff', () => {
  // The strongest guarantee: whatever the generator produces must apply back to
  // the changed side exactly. Covers add, delete, replace, EOF-newline and
  // multi-hunk cases in one property.
  it.each([
    ['one\ntwo\nthree\n', 'one\nTWO\nthree\n'],
    ['keep\ndrop\nkeep2\n', 'keep\nkeep2\n'],
    ['a\nb\n', 'a\nb\nc\n'],
    ['', 'x\ny\n'],
    ['no-eol-newline', 'no-eol-CHANGED'],
    ['1\n2\n3\n4\n5\n6\n7\n8\n9\n', '1\n2\nX\n4\n5\n6\n7\nY\n9\n']
  ])('round-trips the generated patch back to the changed side (%#)', (base, changed) => {
    const { patch } = toUnifiedDiff(base, changed)
    expect(applyUnifiedDiff(base, patch)).toEqual({ output: changed, rejected: [] })
  })

  it('preserves a trailing newline the patch does not touch', () => {
    const base = 'a\nb\nc\n'
    const { patch } = toUnifiedDiff(base, 'a\nB\nc\n')
    expect(applyUnifiedDiff(base, patch).output).toBe('a\nB\nc\n')
  })

  it('rejects a hunk whose context does not match the base', () => {
    const { patch } = toUnifiedDiff('a\nb\nc\n', 'a\nX\nc\n')
    const res = applyUnifiedDiff('totally\ndifferent\nfile\n', patch)
    expect(res.rejected).toEqual([0])
    // The non-matching hunk changes nothing — the base comes back untouched.
    expect(res.output).toBe('totally\ndifferent\nfile\n')
  })

  it('applies the good hunks and rejects only the bad ones', () => {
    const base = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n'
    const { patch } = toUnifiedDiff(base, 'A\nb\nc\nd\ne\nf\ng\nh\ni\nJ\n')
    // Break the base for the first hunk only; the last hunk still matches.
    const res = applyUnifiedDiff('Z\nb\nc\nd\ne\nf\ng\nh\ni\nj\n', patch)
    expect(res.rejected).toEqual([0])
    expect(res.output.endsWith('J\n')).toBe(true)
    expect(res.output.startsWith('Z')).toBe(true)
  })

  it('errors when the text carries no hunk', () => {
    expect(applyUnifiedDiff('a\n', 'not a patch at all')).toEqual({ error: 'not-a-unified-diff' })
  })
})

// MAX_DIFF_LINES guards diff GENERATION, not Apply Patch on a user-supplied
// .patch. A single huge hunk spread into splice() blew the argument limit and
// threw RangeError before any of the patch was applied.
describe('a very large hunk', () => {
  it('applies without spreading an unbounded array into splice', () => {
    const COUNT = 200_000
    const base = 'first\n'
    const added = Array.from({ length: COUNT }, (_, i) => `line ${i}`)
    const patch = [
      '--- a/big.txt',
      '+++ b/big.txt',
      `@@ -1,1 +1,${COUNT + 1} @@`,
      ' first',
      ...added.map((l) => `+${l}`)
    ].join('\n')

    const res = applyUnifiedDiff(base, patch)
    expect(res.error).toBeFalsy()
    expect(res.rejected).toEqual([])
    expect(res.output.split('\n')).toHaveLength(COUNT + 2) // +1 context, +1 trailing
    expect(res.output.endsWith(`line ${COUNT - 1}\n`)).toBe(true)
  })
})
