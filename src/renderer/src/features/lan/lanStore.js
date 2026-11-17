import { defineStore } from 'pinia'

let watching = false

export const useLanStore = defineStore('lan', {
  state: () => ({
    loaded: false,
    enabled: false,
    visible: false,
    popups: true,
    silencedUntil: 0,
    name: '',
    online: false,
    peers: []
  }),
  getters: {
    isActive: (s) => s.enabled && s.online,
    reachable: (s) => new Set(s.enabled ? s.peers.map((p) => p.fp) : [])
  },
  actions: {
    applySnapshot(snapshot) {
      if (snapshot && typeof snapshot === 'object') Object.assign(this, snapshot, { loaded: true })
    },
    async init() {
      if (!watching && window.api?.onLanChanged) {
        watching = true
        window.api.onLanChanged((snapshot) => this.applySnapshot(snapshot))
      }
      this.applySnapshot(await window.api.lanState())
    },
    async update(patch) {
      this.applySnapshot(await window.api.lanUpdate(patch))
    }
  }
})
