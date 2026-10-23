import { describe, expect, it } from 'vitest'
import { identiconCells } from '../../../src/renderer/src/utils/identicon'

const FP = '7F3A 91C2 E04B 5D18 66A0 3B9E'

describe('identiconCells', () => {
  it('is 25 cells, the same for the same fingerprint', () => {
    expect(identiconCells(FP)).toHaveLength(25)
    expect(identiconCells(FP)).toEqual(identiconCells(FP.toLowerCase().replace(/ /g, '')))
  })

  it('mirrors left to right, so it reads as one mark', () => {
    const cells = identiconCells(FP)
    for (let row = 0; row < 5; row++) {
      expect(cells[row * 5]).toBe(cells[row * 5 + 4])
      expect(cells[row * 5 + 1]).toBe(cells[row * 5 + 3])
    }
  })

  it('tells two keys apart', () => {
    expect(identiconCells(FP)).not.toEqual(identiconCells('B21C 0E9F 4410 77AA 9C3D 1E52'))
  })

  it('never draws an empty or a solid square', () => {
    for (const fp of ['0000 0000 0000 0000', 'FFFF FFFF FFFF FFFF', '', null]) {
      const on = identiconCells(fp).filter(Boolean).length
      expect(on).toBeGreaterThan(0)
      expect(on).toBeLessThan(25)
    }
  })
})
