// The clipboard is the most hostile input surface there is — any app writes
// it. The parser must accept exactly what the app's own "Copy to clipboard"
// produces (plus the wrapping chat apps add) and nothing looser, with the
// fingerprint recomputed from the material every time.
import { describe, expect, it } from 'vitest'
import {
  createIdentityKeys,
  decodePublicKey,
  encodePublicKey,
  fingerprint
} from '../../src/main/sealing'
import {
  MAX_KEY_TEXT_BYTES,
  pairingKeyText,
  parseKeyText,
  parsePairingKey
} from '../../src/main/keyText'

const identity = createIdentityKeys()
const keyText = (label = 'Ana laptop') => encodePublicKey({ ...identity.pub, label })

describe('parseKeyText', () => {
  it("accepts the app's own copy-to-clipboard payload and recomputes the fingerprint", () => {
    const parsed = parseKeyText(keyText())
    expect(parsed.fp).toBe(fingerprint(identity.pub.sign, identity.pub.box))
    expect(parsed.defaultLabel).toBe('Ana laptop')
    expect(parsed.key.sign).toBe(identity.pub.sign)
  })

  it('strips the wrapping chat apps add — fences, backticks, whitespace', () => {
    const wrapped = '```json\n' + keyText() + '\n```\n'
    expect(parseKeyText(wrapped).fp).toBe(fingerprint(identity.pub.sign, identity.pub.box))
    expect(parseKeyText('  `' + keyText() + '`  ').fp).toBe(
      fingerprint(identity.pub.sign, identity.pub.box)
    )
  })

  it('never trusts a stated fingerprint — the material decides', () => {
    const lied = keyText().replace(/"fingerprint":\s*"[^"]*"/, '"fingerprint": "0000000000000000"')
    const parsed = parseKeyText(lied)
    expect(parsed.fp).toBe(fingerprint(identity.pub.sign, identity.pub.box))
    expect(parsed.fp).not.toBe('0000000000000000')
  })

  it('refuses oversized text before parsing', () => {
    expect(() => parseKeyText('x'.repeat(MAX_KEY_TEXT_BYTES + 1))).toThrow()
  })

  it('refuses garbage, empty, and JSON of the wrong shape', () => {
    for (const bad of ['', '   ', 'not json', '{"a":1}', '{"format":"nope","sign":1}']) {
      expect(() => parseKeyText(bad), JSON.stringify(bad)).toThrow()
    }
  })

  it('an unlabelled key parses with an empty default label', () => {
    const parsed = parseKeyText(encodePublicKey({ ...identity.pub, label: undefined }))
    expect(parsed.defaultLabel).toBe('')
  })
})

describe('key names on import', () => {
  it('refuses a key whose name is over the limit, rather than cutting it', () => {
    expect(() => parseKeyText(keyText('x'.repeat(41)))).toThrow('name-too-long')
    expect(parseKeyText(keyText('x'.repeat(40))).defaultLabel).toHaveLength(40)
  })
})

describe('keys exchanged by pairing', () => {
  const legacy = () => {
    const { pub } = createIdentityKeys()
    return { ...pub, label: 'ASSSS'.repeat(16) }
  }

  it('reads a key whose name predates the 40-character limit: pairing saves it under the clicked name', () => {
    const pub = legacy()
    expect(() => parseKeyText(encodePublicKey(pub))).toThrow('name-too-long')
    expect(parsePairingKey(encodePublicKey(pub)).fp).toBe(pub.fingerprint)
  })

  it('sends a key without its name, so a machine that still checks the limit accepts it', () => {
    const pub = legacy()
    const sent = pairingKeyText(pub)
    expect(parseKeyText(sent).fp).toBe(pub.fingerprint)
    expect(decodePublicKey(sent).label).toBeUndefined()
  })

  it('still refuses what is not a key', () => {
    expect(() => parsePairingKey('dbk1:bm90IGpzb24=')).toThrow()
    expect(() => parsePairingKey('hello')).toThrow()
  })
})
