import { describe, expect, it } from 'vitest'
import { pairingResult } from '../../../../src/renderer/src/features/lan/pairingResult'

describe('pairingResult', () => {
  it('the adder can retry after a wrong code, an expiry or a lost connection', () => {
    for (const stage of ['mismatch', 'expired', 'connection-lost'])
      expect(pairingResult({ role: 'adder', stage }).action).toBe('retry')
  })

  it('the holder is only told, and asked to request a new code', () => {
    expect(pairingResult({ role: 'holder', stage: 'mismatch' })).toEqual({
      title: 'lan.result.mismatch',
      note: 'lan.result.requestNewCode',
      action: null
    })
    expect(pairingResult({ role: 'holder', stage: 'expired' }).note).toBe(
      'lan.result.requestNewCode'
    )
  })

  it('a declined add says who declined, with nothing to retry', () => {
    expect(pairingResult({ role: 'adder', stage: 'declined' })).toEqual({
      title: 'lan.result.declined',
      note: undefined,
      action: null
    })
  })

  it('a cancelled request has nothing to retry', () => {
    expect(pairingResult({ role: 'adder', stage: 'cancelled' }).action).toBeNull()
  })

  it('stages that are not results have no dialog', () => {
    expect(pairingResult({ role: 'adder', stage: 'enter-code' })).toBeNull()
  })
})
