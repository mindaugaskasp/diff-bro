import { describe, expect, it } from 'vitest'
import { splitRevisionArg } from '../../src/main/gitRevisionArg'

describe('splitRevisionArg', () => {
  // `diffbro compare HEAD~1:src/a.js` — the shape git itself uses.
  it('splits a revision:path argument', () => {
    expect(splitRevisionArg('HEAD~1:src/a.js')).toEqual({
      revision: 'HEAD~1',
      relPath: 'src/a.js'
    })
  })

  it('takes a branch, a tag and a sha', () => {
    expect(splitRevisionArg('main:a.js').revision).toBe('main')
    expect(splitRevisionArg('v1.2.3:a.js').revision).toBe('v1.2.3')
    expect(splitRevisionArg('9a73b33:a.js').revision).toBe('9a73b33')
  })

  it('keeps a path that itself contains a colon', () => {
    expect(splitRevisionArg('HEAD:src/a:b.js')).toEqual({ revision: 'HEAD', relPath: 'src/a:b.js' })
  })

  // A plain path is a plain path — the feature must not capture every argument
  // with a colon in it.
  it('is not a revision argument without a colon', () => {
    expect(splitRevisionArg('src/a.js')).toBeNull()
    expect(splitRevisionArg('')).toBeNull()
    expect(splitRevisionArg(null)).toBeNull()
  })

  // A Windows drive letter is a colon that is emphatically not a revision.
  it('is not fooled by a Windows absolute path', () => {
    expect(splitRevisionArg('C:\\Users\\x\\a.js')).toBeNull()
    expect(splitRevisionArg('C:/Users/x/a.js')).toBeNull()
  })

  it('refuses a revision the fence would not accept', () => {
    expect(splitRevisionArg('--upload-pack=evil:a.js')).toBeNull()
    expect(splitRevisionArg('HEAD;id:a.js')).toBeNull()
  })

  it('refuses an empty half', () => {
    expect(splitRevisionArg(':a.js')).toBeNull()
    expect(splitRevisionArg('HEAD:')).toBeNull()
  })
})
