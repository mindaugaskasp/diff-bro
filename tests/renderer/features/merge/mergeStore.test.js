import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMergeStore } from '../../../../src/renderer/src/features/merge/mergeStore'

const conflict = (i) =>
  ['<<<<<<< HEAD', `ours ${i}`, '=======', `theirs ${i}`, '>>>>>>> feature'].join('\n')
const conflicted = (n = 1) => Array.from({ length: n }, (_, i) => conflict(i)).join('\ntween\n')

beforeEach(() => {
  setActivePinia(createPinia())
  window.api = {
    writeMerged: vi.fn(async () => ({ ok: true })),
    cancelMerge: vi.fn(async () => ({ ok: true }))
  }
})

const begin = (content, extra = {}) => {
  const merge = useMergeStore()
  merge.begin({ content, fileName: 'app.txt', ...extra })
  return merge
}

describe('mergeStore — the result never shows a marker', () => {
  // `<<<<<<<` is a file format, not a user interface. The result opens as a
  // valid file with our side standing in each conflicted place.
  it('opens marker-free, with our side in place', () => {
    const merge = begin('a\n' + conflicted() + '\nb')
    expect(merge.result).toBe('a\nours 0\nb')
    expect(merge.result).not.toContain('>>>>>>>')
    expect(merge.result).not.toContain('<<<<<<<')
    expect(merge.result).not.toContain('=======')
  })

  it('still knows both sides of every conflicted place', () => {
    const merge = begin(conflicted(2))
    expect(merge.regions).toHaveLength(2)
    expect(merge.regions[0]).toEqual({ ours: ['ours 0'], theirs: ['theirs 0'], resolved: false })
  })

  // Nothing in the text says a region is settled once the markers are gone, so
  // resolution is state rather than something re-parsed.
  it('counts what is left from the regions, not from the text', () => {
    const merge = begin(conflicted(3))
    expect(merge.remaining).toBe(3)
    expect(merge.canSave).toBe(false)
    merge.markResolved(0)
    merge.markResolved(1)
    expect(merge.remaining).toBe(1)
    expect(merge.canSave).toBe(false)
    merge.markResolved(2)
    expect(merge.canSave).toBe(true)
  })

  it('has nothing to resolve in a file with no conflicts', () => {
    const merge = begin('plain\ntext\n')
    expect(merge.regions).toHaveLength(0)
    expect(merge.canSave).toBe(true)
  })

  it('refuses a file whose markers do not close', () => {
    const merge = begin('<<<<<<< HEAD\nunfinished\n')
    expect(merge.error).toBe('unreadable')
    expect(merge.canSave).toBe(false)
  })

  it('walks the regions, wrapping at either end', () => {
    const merge = begin(conflicted(3))
    merge.step(1)
    expect(merge.at).toBe(1)
    merge.step(-2)
    expect(merge.at).toBe(2)
    merge.step(1)
    expect(merge.at).toBe(0)
  })
})

describe('mergeStore — the sides and the walk', () => {
  it('prefers the clean texts git’s index handed over', () => {
    const merge = begin(conflicted(), { ours: 'OURS FILE', theirs: 'THEIRS FILE', base: 'BASE' })
    expect(merge.ours).toBe('OURS FILE')
    expect(merge.theirs).toBe('THEIRS FILE')
    expect(merge.base).toBe('BASE')
  })

  it('reconstructs them from the markers when the index had none', () => {
    const merge = begin('top\n' + conflicted() + '\nend')
    expect(merge.ours).toBe('top\nours 0\nend')
    expect(merge.theirs).toBe('top\ntheirs 0\nend')
  })

  // The file's own shape survives: a trailing newline is part of the file.
  it('keeps the trailing newline the file arrived with', () => {
    expect(begin('a\n' + conflicted() + '\nb\n').result).toBe('a\nours 0\nb\n')
  })

  // git calls the tool once per file, so without this the third of thirty looks
  // exactly like the last.
  it('carries the file’s place in the walk, and hides it for a lone file', () => {
    expect(begin(conflicted(), { position: 3, total: 30 }).showsWalk).toBe(true)
    expect(begin(conflicted(), { position: 3, total: 30 }).position).toBe(3)
    expect(begin(conflicted()).showsWalk).toBe(false)
  })
})

describe('mergeStore — saving', () => {
  it('sends the text and nothing else', async () => {
    const merge = begin(conflicted())
    merge.markResolved(0)
    expect(await merge.save()).toBe(true)
    // The line keeps the ending it had: a merge tool that strips a trailing
    // newline has rewritten the file it was asked to resolve.
    expect(window.api.writeMerged).toHaveBeenCalledWith('ours 0\n')
  })

  it('will not send a file with a region still undecided', async () => {
    const merge = begin(conflicted())
    expect(await merge.save()).toBe(false)
    expect(window.api.writeMerged).not.toHaveBeenCalled()
  })

  it('tells main when the reader declines, so the launcher is released', async () => {
    await begin(conflicted()).close()
    expect(window.api.cancelMerge).toHaveBeenCalled()
  })

  it('does not cancel after a successful save', async () => {
    const merge = begin(conflicted())
    merge.markResolved(0)
    await merge.save()
    await merge.close()
    expect(window.api.cancelMerge).not.toHaveBeenCalled()
  })
})

// Monaco keeps one ending per model, so a mixed file comes back out normalised —
// including on lines nobody touched. The tool cannot stop that, so it says so.
describe('a file that mixes line endings', () => {
  const begin = (content) => {
    const merge = useMergeStore()
    merge.begin({ content })
    return merge
  }
  const joined = (eol) =>
    ['a', '<<<<<<< HEAD', 'ours', '=======', 'theirs', '>>>>>>> f', 'b'].join(eol) + eol

  it('says so before anything is written', () => {
    expect(begin(joined('\r\n').replace('a\r\n', 'a\n')).mixedEndings).toBe(true)
  })

  it('stays quiet for a file that is consistent either way', () => {
    expect(begin(joined('\n')).mixedEndings).toBe(false)
    expect(begin(joined('\r\n')).mixedEndings).toBe(false)
  })
})
