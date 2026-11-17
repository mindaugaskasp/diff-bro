import { describe, expect, it, vi } from 'vitest'
import { runSteps } from '../../src/main/startSteps'

describe('runSteps', () => {
  it('runs every step after one throws, and reports the one that did', () => {
    const ran = []
    const onError = vi.fn()
    runSteps(
      [
        ['menu', () => ran.push('menu')],
        [
          'tray',
          () => {
            throw new Error('Failed to load image')
          }
        ],
        ['lan', () => ran.push('lan')]
      ],
      onError
    )
    expect(ran).toEqual(['menu', 'lan'])
    expect(onError).toHaveBeenCalledWith(
      'tray',
      expect.objectContaining({ message: 'Failed to load image' })
    )
  })

  it('reports a step whose promise rejects without holding up the rest', async () => {
    const onError = vi.fn()
    const ran = []
    runSteps(
      [
        ['lan', () => Promise.reject(new Error('no interfaces'))],
        ['cli', () => ran.push('cli')]
      ],
      onError
    )
    expect(ran).toEqual(['cli'])
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('lan', expect.any(Error)))
  })
})
