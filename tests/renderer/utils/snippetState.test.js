// The fields a snippet derives from its own plaintext. They can only be
// computed while it is decrypted, so getting the rule wrong here is a verdict
// the library then carries around until someone re-saves the snippet.
import { describe, expect, it } from 'vitest'
import { derivedFrom, promptVars } from '../../../src/renderer/src/utils/snippetState'

const PHP = '$appId = "ABCD";\n$apiToken = "EFGH";'

describe('derivedFrom — detection', () => {
  it('detects for a snippet that asked to be detected', () => {
    expect(derivedFrom({ language: 'auto' }, PHP).detected).toBe('php')
    expect(derivedFrom({}, PHP).detected).toBe('php')
  })

  // The reported bug: a PHP snippet saved before the detector could read PHP
  // kept `plaintext` for ever, because only an undefined field was backfilled.
  it('replaces a stale verdict rather than keeping it', () => {
    expect(derivedFrom({ language: 'auto', detected: 'plaintext' }, PHP).detected).toBe('php')
  })

  it('leaves an explicitly chosen language alone', () => {
    expect(derivedFrom({ language: 'markdown', detected: 'markdown' }, PHP).detected).toBe(
      'markdown'
    )
  })

  it('still backfills an explicit snippet that never recorded one', () => {
    expect(derivedFrom({ language: 'markdown' }, PHP).detected).toBe('php')
  })
})

describe('derivedFrom — prompt variables', () => {
  it('reads {{variables}} out of a claude prompt', () => {
    expect(derivedFrom({ language: 'claude' }, 'Review {{file}} for {{concern}}').vars).toEqual([
      'file',
      'concern'
    ])
  })

  // {{ }} is template code in every other language, not a fill placeholder.
  it('finds none in any other language', () => {
    expect(derivedFrom({ language: 'auto' }, 'const x = `{{a}}`').vars).toEqual([])
    expect(promptVars('javascript', '{{a}}')).toEqual([])
  })

  it('keeps a list it already has rather than recomputing it', () => {
    const vars = ['kept']
    expect(derivedFrom({ language: 'claude', detected: 'claude', vars }, 'Review {{file}}').vars).toBe(
      vars
    )
  })

  // The two fields answer the same question, so a re-detection that moves one
  // must move the other — `vars` only ever meant anything for `claude`.
  it('recomputes the list whenever the detected language moved', () => {
    const stale = { language: 'auto', detected: 'plaintext', vars: ['stale'] }
    expect(derivedFrom(stale, '# Notes\n\nSome prose.').vars).toEqual([])
    const settled = { language: 'auto', detected: 'markdown', vars: ['stale'] }
    expect(derivedFrom(settled, '# Notes\n\nSome prose.').vars).toEqual(['stale'])
  })
})
