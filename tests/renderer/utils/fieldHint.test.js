import { describe, expect, it } from 'vitest'
import { hintFits } from '../../../src/renderer/src/utils/fieldHint'

describe('hintFits', () => {
  const field = { fieldWidth: 380, inset: 8, gap: 16 }

  it('fits when the typed text and the hint leave the gap between them', () => {
    expect(hintFits({ ...field, typedWidth: 150, hintWidth: 190 })).toBe(true)
  })

  it('does not fit once they would touch', () => {
    expect(hintFits({ ...field, typedWidth: 160, hintWidth: 190 })).toBe(false)
  })
})
