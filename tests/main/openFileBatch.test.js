import { describe, expect, it, vi } from 'vitest'
import { batchOpenFiles } from '../../src/main/openFileBatch'

describe('batchOpenFiles', () => {
  it('delivers files that arrive together as one batch', () => {
    vi.useFakeTimers()
    const deliver = vi.fn()
    const add = batchOpenFiles(deliver, 150)
    add('/a.txt')
    vi.advanceTimersByTime(50)
    add('/b.txt')
    vi.advanceTimersByTime(150)
    expect(deliver.mock.calls).toEqual([[['/a.txt', '/b.txt']]])
    vi.useRealTimers()
  })

  it('delivers a file that arrives later on its own', () => {
    vi.useFakeTimers()
    const deliver = vi.fn()
    const add = batchOpenFiles(deliver, 150)
    add('/a.txt')
    vi.advanceTimersByTime(200)
    add('/b.txt')
    vi.advanceTimersByTime(200)
    expect(deliver.mock.calls).toEqual([[['/a.txt']], [['/b.txt']]])
    vi.useRealTimers()
  })
})
