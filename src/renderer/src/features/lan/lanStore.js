import { defineStore } from 'pinia'
import { t } from '../../i18n'
import { useDiffStore } from '../../stores/diffStore'

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
    peers: [],
    pairing: null
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
        window.api.onLanPairing((view) => this.showPairing(view))
      }
      this.applySnapshot(await window.api.lanState())
    },
    async update(patch) {
      this.applySnapshot(await window.api.lanUpdate(patch))
    },
    showPairing(view) {
      if (view?.stage !== 'added') return (this.pairing = view)
      this.pairing = null
      useDiffStore().showNotice(t('lan.add.added', { name: view.name }))
    },
    async add({ fp, name }) {
      this.pairing = { role: 'adder', stage: 'connecting', fp, name }
      const res = await window.api.lanAdd(fp)
      if (res?.error) this.pairing = { role: 'adder', stage: 'connection-lost', fp, name }
    },
    submitCode(code) {
      if (this.pairing?.id) return window.api.lanSubmitCode(this.pairing.id, code)
    },
    cancelPairing() {
      const id = this.pairing?.id
      this.pairing = null
      if (id) window.api.lanCancel(id)
    },
    dismissPairing() {
      this.pairing = null
    },
    retryPairing() {
      const { fp, name } = this.pairing
      this.pairing = null
      return this.add({ fp, name })
    },
    pasteCode() {
      return window.api.lanPasteCode()
    }
  }
})
