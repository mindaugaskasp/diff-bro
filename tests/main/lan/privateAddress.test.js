import { describe, expect, it } from 'vitest'
import { isPrivateAddress, privateInterfaceAddresses } from '../../../src/main/lan/privateAddress'

describe('isPrivateAddress', () => {
  it.each([
    '10.0.0.4',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.20',
    '169.254.10.10',
    '127.0.0.1',
    'fd12:3456::1',
    'fc00::1',
    'fe80::1c2b:3cff:fe4d:5e6f%en0',
    '::1',
    '::ffff:192.168.0.7'
  ])('accepts %s', (ip) => expect(isPrivateAddress(ip)).toBe(true))

  it.each([
    '8.8.8.8',
    '172.15.0.1',
    '172.32.0.1',
    '192.169.0.1',
    '11.0.0.1',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8',
    'not an ip',
    '',
    '999.1.1.1',
    undefined
  ])('refuses %s', (ip) => expect(isPrivateAddress(ip)).toBe(false))
})

describe('privateInterfaceAddresses', () => {
  it('keeps private, external addresses and drops loopback and public ones', () => {
    const list = privateInterfaceAddresses({
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      en0: [
        { address: '192.168.1.20', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false, scopeid: 4 },
        { address: '2001:db8::5', family: 'IPv6', internal: false }
      ],
      utun2: [{ address: '8.8.4.4', family: 'IPv4', internal: false }]
    })
    expect(list).toEqual([
      { address: '192.168.1.20', family: 'IPv4', name: 'en0' },
      { address: 'fe80::1', family: 'IPv6', name: 'en0', scopeid: 4 }
    ])
  })

  it('treats a missing table as no interfaces', () => {
    expect(privateInterfaceAddresses(undefined)).toEqual([])
  })
})
