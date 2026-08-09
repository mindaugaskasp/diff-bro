// The clipboard is the most hostile input surface there is — any app writes
// it. The parser must accept exactly what the app's own "Copy to clipboard"
// produces (plus the wrapping chat apps add) and nothing looser, with the
// fingerprint recomputed from the material every time.
import { describe, expect, it } from 'vitest'
import { createIdentityKeys, encodePublicKey, fingerprint } from '../../src/main/sealing'
import { MAX_KEY_TEXT_BYTES, parseKeyText } from '../../src/main/keyText'

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
