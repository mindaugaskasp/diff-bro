import { describe, expect, it } from 'vitest'
import { indentStyleFor } from '../../../src/renderer/src/utils/indentStyle'

describe('indentStyleFor', () => {
  it.each([
    ['python', 4],
    ['php', 4],
    ['java', 4],
    ['yaml', 2],
    ['json', 2],
    ['javascript', 2]
  ])('indents %s by %i spaces', (language, tabSize) => {
    expect(indentStyleFor(language)).toEqual({ insertSpaces: true, tabSize })
  })

  it('indents Go with tabs, as gofmt does', () => {
    expect(indentStyleFor('go')).toEqual({ insertSpaces: false, tabSize: 4 })
  })

  it('falls back to four spaces for anything else', () => {
    expect(indentStyleFor('plaintext')).toEqual({ insertSpaces: true, tabSize: 4 })
  })
})
