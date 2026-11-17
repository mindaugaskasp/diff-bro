// Names and fingerprints only: the renderer never sees an address or a port.
export const lanApi = (ipcRenderer) => ({
  lanState: () => ipcRenderer.invoke('lan:state'),
  lanUpdate: (patch) => ipcRenderer.invoke('lan:update', patch),
  onLanChanged: (handler) => {
    ipcRenderer.on('lan:changed', (_e, snapshot) => handler(snapshot))
  },
  // Paste reads the clipboard in main and returns only a code-shaped value.
  lanAdd: (fp) => ipcRenderer.invoke('lan:add', String(fp)),
  lanSubmitCode: (id, code) => ipcRenderer.invoke('lan:submitCode', String(id), String(code)),
  lanCancel: (id) => ipcRenderer.invoke('lan:cancel', String(id)),
  lanPasteCode: () => ipcRenderer.invoke('lan:pasteCode'),
  onLanPairing: (handler) => {
    ipcRenderer.on('lan:pairing', (_e, view) => handler(view))
  }
})
