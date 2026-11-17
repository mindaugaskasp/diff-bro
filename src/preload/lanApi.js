// Sharing on the local network: settings in, a snapshot of fingerprints and
// names out. The renderer never sees an address or a port.
export const lanApi = (ipcRenderer) => ({
  lanState: () => ipcRenderer.invoke('lan:state'),
  lanUpdate: (patch) => ipcRenderer.invoke('lan:update', patch),
  onLanChanged: (handler) => {
    ipcRenderer.on('lan:changed', (_e, snapshot) => handler(snapshot))
  }
})
