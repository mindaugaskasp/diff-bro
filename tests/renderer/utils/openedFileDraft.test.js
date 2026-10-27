import { describe, expect, it } from 'vitest'
import { openedFileDraft } from '../../../src/renderer/src/utils/openedFileDraft'

const file = (name, content = 'x') => ({ path: `/work/app/${name}`, name, content })

describe('openedFileDraft', () => {
  it('names the draft after the file and remembers where it came from', () => {
    const draft = openedFileDraft(file('config.yaml', 'a: 1\n'))
    expect(draft).toMatchObject({
      id: null,
      initialName: 'config.yaml',
      initialContent: 'a: 1\n',
      openedPath: '/work/app/config.yaml',
      openedFrom: '/work/app'
    })
  })

  it('takes the syntax from the extension', () => {
    expect(openedFileDraft(file('config.yaml')).initialLanguage).toBe('yaml')
    expect(openedFileDraft(file('a.py')).initialLanguage).toBe('python')
  })

  it('leaves a syntax the snippet picker does not offer to detection', () => {
    expect(openedFileDraft(file('main.c')).initialLanguage).toBe('auto')
    expect(openedFileDraft(file('README')).initialLanguage).toBe('auto')
  })

  it('keeps a Windows folder', () => {
    const draft = openedFileDraft({ path: 'C:\\work\\a.txt', name: 'a.txt', content: '' })
    expect(draft.openedFrom).toBe('C:\\work')
  })
})
