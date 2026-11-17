const RETRY = ['mismatch', 'expired', 'connection-lost']

export function pairingResult({ role, stage }) {
  const adder = role === 'adder'
  const note = {
    mismatch: adder ? 'lan.result.mismatchAdder' : 'lan.result.requestNewCode',
    expired: adder ? 'lan.result.expiredAdder' : 'lan.result.requestNewCode',
    cancelled: 'lan.result.cancelledNote',
    'connection-lost': 'lan.result.connectionLostNote'
  }[stage]
  const title = {
    mismatch: 'lan.result.mismatch',
    expired: 'lan.result.expired',
    cancelled: 'lan.result.cancelled',
    'connection-lost': 'lan.result.connectionLost',
    declined: 'lan.result.declined'
  }[stage]
  if (!title) return null
  const action = adder && RETRY.includes(stage) ? 'retry' : null
  return { title, note, action }
}
