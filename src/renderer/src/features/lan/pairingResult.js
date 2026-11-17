const RETRY = ['mismatch', 'expired', 'connection-lost']

export function pairingResult({ role, stage }) {
  const adder = role === 'adder'
  const note = {
    mismatch: adder ? 'lan.result.mismatchAdder' : 'lan.result.requestNewCode',
    expired: adder ? 'lan.result.expiredAdder' : 'lan.result.requestNewCode',
    cancelled: 'lan.result.cancelledNote',
    'connection-lost': 'lan.result.connectionLostNote',
    'added-you': 'lan.result.addBackNote'
  }[stage]
  const title = {
    mismatch: 'lan.result.mismatch',
    expired: 'lan.result.expired',
    cancelled: 'lan.result.cancelled',
    'connection-lost': 'lan.result.connectionLost',
    'added-you': 'lan.result.addedYou'
  }[stage]
  if (!title) return null
  const action = stage === 'added-you' ? 'addBack' : adder && RETRY.includes(stage) ? 'retry' : null
  return { title, note, action }
}
