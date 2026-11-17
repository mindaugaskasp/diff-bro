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
  },
  lanSend: (request) => ipcRenderer.invoke('lan:send', request),
  lanItems: () => ipcRenderer.invoke('lan:items'),
  lanOpenItem: (id) => ipcRenderer.invoke('lan:openItem', String(id)),
  lanDeclineItem: (id) => ipcRenderer.invoke('lan:declineItem', String(id)),
  lanSilence: (choice) => ipcRenderer.invoke('lan:silence', choice),
  onLanItemArrived: (handler) => {
    ipcRenderer.on('lan:itemArrived', (_e, item) => handler(item))
  },
  onLanItemsChanged: (handler) => {
    ipcRenderer.on('lan:itemsChanged', () => handler())
  }
})
