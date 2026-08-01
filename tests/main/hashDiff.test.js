import { describe, it, expect } from 'vitest'
import { diffDigests } from '../../src/main/hashDiff'
import { digestBytes } from '../../src/main/lineIndexCore'

const sideOf = (lines) => ({
  hi: Uint32Array.from(lines, (l) => digestBytes(Buffer.from(l)).hi),
  lo: Uint32Array.from(lines, (l) => digestBytes(Buffer.from(l)).lo),
  count: lines.length
})

const runsOf = ({ runs }) => {
  const out = []
  for (let k = 0; k < runs.length; k += 5) {
    out.push({
      same: !!runs[k],
      ls: runs[k + 1],
      ln: runs[k + 2],
      rs: runs[k + 3],
      rn: runs[k + 4]
    })
  }
  return out
}

// The invariant the viewer depends on: the runs, read in order, must consume
// every line of both sides exactly once and in order. If this holds, no row can
// show the wrong line and no line can go missing.
function expectCovers(result, left, right) {
  let l = 0
  let r = 0
  for (const run of runsOf(result)) {
    expect(run.ls).toBe(l)
    expect(run.rs).toBe(r)
    expect(run.ln).toBeGreaterThanOrEqual(0)
    expect(run.rn).toBeGreaterThanOrEqual(0)
    if (run.same) {
      expect(run.ln).toBe(run.rn)
      // A "same" run must really be same — the whole point of the digests.
      for (let k = 0; k < run.ln; k++) expect(left[l + k]).toBe(right[r + k])
    }
    l += run.ln
    r += run.rn
  }
  expect(l).toBe(left.length)
  expect(r).toBe(right.length)
}

const diff = (left, right, opts) => diffDigests(sideOf(left), sideOf(right), opts)

// Matched-line count from a textbook LCS, to check the alignment is not merely
// valid but as good as an exact one on inputs small enough to compute both.
function lcsLength(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  return dp[0][0]
}

const matched = (result) => runsOf(result).reduce((n, r) => n + (r.same ? r.ln : 0), 0)

describe('diffDigests', () => {
  it('reports two empty files as no runs at all', () => {
    const res = diff([], [])
    expect(res.runs.length).toBe(0)
    expect(res.additions).toBe(0)
    expect(res.deletions).toBe(0)
  })

  it('collapses identical files into one same run', () => {
    const lines = ['a', 'b', 'c']
    const res = diff(lines, lines)
    expect(runsOf(res)).toEqual([{ same: true, ls: 0, ln: 3, rs: 0, rn: 3 }])
    expect(res.additions).toBe(0)
    expect(res.deletions).toBe(0)
  })

  it('reads an empty left side as pure insertion', () => {
    const res = diff([], ['a', 'b'])
    expect(runsOf(res)).toEqual([{ same: false, ls: 0, ln: 0, rs: 0, rn: 2 }])
    expect(res.additions).toBe(2)
    expect(res.deletions).toBe(0)
  })

  it('reads an empty right side as pure deletion', () => {
    const res = diff(['a', 'b'], [])
    expect(res.deletions).toBe(2)
    expect(res.additions).toBe(0)
  })

  it('isolates a single changed line between equal surroundings', () => {
    const left = ['a', 'b', 'c', 'd']
    const right = ['a', 'B', 'c', 'd']
    const res = diff(left, right)
    expect(runsOf(res)).toEqual([
      { same: true, ls: 0, ln: 1, rs: 0, rn: 1 },
      { same: false, ls: 1, ln: 1, rs: 1, rn: 1 },
      { same: true, ls: 2, ln: 2, rs: 2, rn: 2 }
    ])
    expect(res).toMatchObject({ additions: 1, deletions: 1, approximate: false })
    expectCovers(res, left, right)
  })

  it('finds an insertion in the middle without dragging the tail out of line', () => {
    const left = ['a', 'b', 'c']
    const right = ['a', 'x', 'b', 'c']
    const res = diff(left, right)
    expect(res).toMatchObject({ additions: 1, deletions: 0 })
    expectCovers(res, left, right)
    expect(matched(res)).toBe(3)
  })

  it('pairs a replaced block so both sides sit on the same rows', () => {
    const left = ['keep', 'one', 'two', 'keep2']
    const right = ['keep', 'uno', 'dos', 'keep2']
    const res = diff(left, right)
    const middle = runsOf(res).find((r) => !r.same)
    expect(middle).toMatchObject({ ln: 2, rn: 2 })
    expectCovers(res, left, right)
  })

  it('covers every line for a long file with scattered edits', () => {
    const left = Array.from({ length: 4000 }, (_, i) => `line ${i}`)
    const right = left.slice()
    right[10] = 'changed'
    right.splice(2000, 0, 'inserted a', 'inserted b')
    right.splice(3500, 3)
    const res = diff(left, right)
    expectCovers(res, left, right)
    expect(res.approximate).toBe(false)
  })

  // A budget of 1 cell puts every region past the exact path, so only the
  // anchoring route can produce this alignment.
  it('anchors on unique lines when the region is too big for an exact LCS', () => {
    const filler = Array.from({ length: 50 }, (_, i) => `x${i % 3}`)
    const left = [...filler, 'MARK-A', ...filler, 'MARK-B', ...filler]
    const right = [...filler, 'MARK-A', ...filler, 'inserted', 'MARK-B', ...filler]
    const res = diff(left, right, { lcsBudget: 1 })
    expectCovers(res, left, right)
    expect(res.additions).toBe(1)
    expect(res.deletions).toBe(0)
    expect(res.approximate).toBe(false)
  })

  it('anchors a large file the exact path could never afford', () => {
    const left = Array.from({ length: 60_000 }, (_, i) => `line ${i}`)
    const right = left.slice()
    right.splice(30_000, 0, 'inserted')
    right[50_000] = 'edited'
    const res = diff(left, right)
    expectCovers(res, left, right)
    expect(res).toMatchObject({ additions: 2, deletions: 1, approximate: false })
  })

  it('matches an exact LCS on randomised small inputs', () => {
    let seed = 12345
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let trial = 0; trial < 60; trial++) {
      const alphabet = 'abcdefgh'
      const pick = (n) =>
        Array.from({ length: n }, () => alphabet[Math.floor(rand() * alphabet.length)])
      const left = pick(2 + Math.floor(rand() * 14))
      const right = pick(2 + Math.floor(rand() * 14))
      const res = diff(left, right)
      expectCovers(res, left, right)
      expect(matched(res)).toBe(lcsLength(left, right))
    }
  })

  it('still covers both sides when the LCS budget forbids the exact path', () => {
    // No unique lines anywhere, so anchoring finds nothing and a zero budget
    // forces the positional fallback.
    const left = Array.from({ length: 40 }, (_, i) => (i % 2 ? 'a' : 'b'))
    const right = Array.from({ length: 30 }, (_, i) => (i % 2 ? 'b' : 'a'))
    const res = diff(left, right, { lcsBudget: 0 })
    expect(res.approximate).toBe(true)
    expectCovers(res, left, right)
  })

  it('stops subdividing once the run budget is spent, still covering both sides', () => {
    const left = Array.from({ length: 600 }, (_, i) => `l${i}`)
    const right = Array.from({ length: 600 }, (_, i) => (i % 2 ? `l${i}` : `r${i}`))
    const res = diff(left, right, { lcsBudget: 0, maxRuns: 8 })
    expect(res.approximate).toBe(true)
    expectCovers(res, left, right)
    // The cap is the point: without it this alignment is ~600 runs.
    expect(res.runs.length / 5).toBeLessThan(20)
  })

  it('merges runs that touch instead of emitting two halves of one stretch', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `u${i}`)
    // Every line unique: the prefix trim and the anchors both describe the same
    // stretch, and the result must be a single run.
    expect(runsOf(diff(lines, lines))).toHaveLength(1)
  })

  it('never emits a zero-length run', () => {
    const left = ['a', 'b', 'c', 'd', 'e']
    const right = ['a', 'q', 'c', 'e', 'z']
    for (const run of runsOf(diff(left, right))) {
      expect(Math.max(run.ln, run.rn)).toBeGreaterThan(0)
    }
  })
})
