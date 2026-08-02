import { describe, expect, it, vi, beforeEach } from 'vitest'

// The export handler is the only place the app writes a file the renderer named
// the contents of, so what it will and will not write is worth pinning down.
// files.js imports Electron, so the handler is exercised through a stub of it.

const handlers = new Map()
const saveDialog = vi.fn()
const written = []

vi.mock('electron', () => ({
  app: { getPath: () => '/userData' },
  BrowserWindow: { fromWebContents: () => ({}) },
  clipboard: { availableFormats: () => [], read: () => '', readBuffer: () => Buffer.alloc(0) },
  dialog: {
    showSaveDialog: (...a) => saveDialog(...a),
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showMessageBox: async () => ({ response: 0 })
  },
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }
}))
vi.mock('fs/promises', () => {
  const fns = {
    readFile: async () => Buffer.alloc(0),
    stat: async () => ({ size: 0 }),
    writeFile: async (path, text) => {
      written.push({ path, text })
    }
  }
  return { ...fns, default: fns }
})
vi.mock('../../src/main/appData', () => ({ readSettings: () => ({}) }))

const { registerFileIpc } = await import('../../src/main/files')
registerFileIpc()
const exportFile = (payload) => handlers.get('diff:exportFile')({ sender: {} }, payload)

beforeEach(() => {
  written.length = 0
  saveDialog.mockReset()
  saveDialog.mockResolvedValue({ canceled: false, filePath: '/out/file' })
})

describe('diff:exportFile', () => {
  it('writes an HTML export with the .html default name', async () => {
    const res = await exportFile({ text: '<html>', format: 'html', name: 'a-vs-b' })
    expect(res).toEqual({ ok: true, path: '/out/file' })
    expect(saveDialog.mock.calls[0][1].defaultPath).toBe('a-vs-b.html')
    expect(written[0].text).toBe('<html>')
  })

  it('writes a CSV export through the same handler', async () => {
    await exportFile({ text: 'a,b', format: 'csv', name: 'changes' })
    expect(saveDialog.mock.calls[0][1].defaultPath).toBe('changes.csv')
    expect(saveDialog.mock.calls[0][1].filters).toEqual([{ name: 'CSV', extensions: ['csv'] }])
  })

  // The format names a row of main's own table. A renderer cannot pick the
  // extension, so it cannot ask for an executable one.
  it('refuses a format that is not on the list', async () => {
    for (const format of ['exe', 'sh', '', undefined, 'constructor', '__proto__']) {
      expect(await exportFile({ text: 'x', format, name: 'n' })).toEqual({ error: 'bad-args' })
    }
    expect(written).toHaveLength(0)
  })

  it('refuses anything that is not text, and a missing payload', async () => {
    expect(await exportFile({ text: null, format: 'csv' })).toEqual({ error: 'bad-args' })
    expect(await exportFile(undefined)).toEqual({ error: 'bad-args' })
    expect(written).toHaveLength(0)
  })

  it('strips path separators out of the suggested name', async () => {
    await exportFile({ text: 'x', format: 'csv', name: '../../etc/passwd' })
    expect(saveDialog.mock.calls[0][1].defaultPath).toBe('..-..-etc-passwd.csv')
  })

  it('writes nothing when the user cancels the dialog', async () => {
    saveDialog.mockResolvedValue({ canceled: true })
    expect(await exportFile({ text: 'x', format: 'csv', name: 'n' })).toEqual({ canceled: true })
    expect(written).toHaveLength(0)
  })
})
