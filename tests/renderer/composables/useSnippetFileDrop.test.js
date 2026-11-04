import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSnippetFileDrop } from '../../../src/renderer/src/composables/useSnippetFileDrop'

const dropOf = (file) => ({ dataTransfer: { files: file ? [file] : [] } })

describe('useSnippetFileDrop', () => {
  beforeEach(() => {
    window.api = {
      getPathForFile: vi.fn(() => '/work/deploy.yaml'),
      readFile: vi.fn(async () => ({
        content: 'kind: Deployment',
        name: 'deploy.yaml',
        path: '/work/deploy.yaml'
      }))
    }
  })
  afterEach(() => delete window.api)

  it('opens a dropped file as a new unsaved snippet tab, named after the file', async () => {
    const openSnippet = vi.fn()
    const { onDropFile } = useSnippetFileDrop({ openSnippet })
    await onDropFile(dropOf({}))
    expect(openSnippet).toHaveBeenCalledTimes(1)
    const [draft, title] = openSnippet.mock.calls[0]
    expect(title).toBe('deploy.yaml')
    expect(draft).toMatchObject({
      id: null,
      initialName: 'deploy.yaml',
      initialContent: 'kind: Deployment',
      openedPath: '/work/deploy.yaml'
    })
  })

  it('opens nothing when the drop carries no file or the read fails', async () => {
    const openSnippet = vi.fn()
    const { onDropFile } = useSnippetFileDrop({ openSnippet })
    await onDropFile(dropOf(null))
    window.api.readFile.mockResolvedValueOnce({ error: 'too large' })
    await onDropFile(dropOf({}))
    expect(openSnippet).not.toHaveBeenCalled()
  })
})
