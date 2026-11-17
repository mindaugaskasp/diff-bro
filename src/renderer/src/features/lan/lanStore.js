import { defineStore } from 'pinia'
import { t } from '../../i18n'
import { useDiffStore } from '../../stores/diffStore'
import { arePopupsShown, openReceivedEntry, withoutId } from './itemActions'
import { clockTime } from '../../utils/countdown'
import { silenceLabelKey } from './silenceChoices'

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
    pairing: null,
    items: [],
    offerQueue: [],
    bellOpen: false,
    received: {},
    requests: [],
    confirmStop: null,
    revokedBy: null
  }),
  getters: {
    isActive: (s) => s.enabled && s.online,
    reachable: (s) => new Set(s.enabled ? s.peers.map((p) => p.fp) : []),
    currentOffer: (s) => s.items.find((i) => i.id === s.offerQueue[0]) ?? null,
    isSilenced: (s) => !arePopupsShown(s),
    showsBell: (s) => s.items.length + s.requests.length > 0 || !arePopupsShown(s),
    liveRequests: (s) => s.requests.filter((r) => r.stage === 'show-code'),
    silencedUntilText: (s) => (s.silencedUntil > Date.now() ? clockTime(s.silencedUntil) : '')
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
        window.api.onLanItemArrived((item) => this.itemArrived(item))
        window.api.onLanItemsChanged(() => this.loadItems())
        window.api.onLanRevoked((who) => (this.revokedBy = who))
      }
      this.applySnapshot(await window.api.lanState())
      await this.loadItems()
    },
    async update(patch) {
      this.applySnapshot(await window.api.lanUpdate(patch))
    },
    showPairing(view) {
      if (this.holdRequest(view)) return
      const notice = { added: 'lan.add.added', 'added-back': 'lan.add.addedBack' }[view?.stage]
      if (!notice) return (this.pairing = view)
      this.pairing = null
      useDiffStore().showNotice(t(notice, { name: view.name }))
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
    },
    async loadItems() {
      this.items = (await window.api.lanItems()) ?? []
      this.offerQueue = this.offerQueue.filter((id) => this.items.some((i) => i.id === id))
    },
    async itemArrived(item) {
      await this.loadItems()
      if (arePopupsShown(this)) this.offerQueue = [...withoutId(this.offerQueue, item.id), item.id]
    },
    dismissOffers() {
      this.offerQueue = []
    },
    async declineItem(id) {
      this.items = withoutId(this.items, id)
      this.offerQueue = withoutId(this.offerQueue, id)
      await window.api.lanDeclineItem(id)
    },
    async openItem(id) {
      const item = this.items.find((i) => i.id === id)
      this.items = withoutId(this.items, id)
      this.offerQueue = withoutId(this.offerQueue, id)
      this.bellOpen = false
      const res = await window.api.lanOpenItem(id)
      if (!res?.ok) return useDiffStore().showNotice(t('lan.items.gone'))
      const tabId = openReceivedEntry(res.entry, res.from ?? item?.from)
      if (tabId)
        this.received = {
          ...this.received,
          [tabId]: { from: res.from ?? item?.from, expiresAt: res.entry.expiresAt }
        }
    },
    forgetReceived(tabId) {
      this.received = Object.fromEntries(
        Object.entries(this.received).filter(([id]) => id !== tabId)
      )
    },
    async silence(choice) {
      this.offerQueue = []
      this.applySnapshot(await window.api.lanSilence(choice))
      useDiffStore().showNotice(
        t(choice === 'forever' ? 'lan.silence.offForever' : 'lan.silence.silencedFor', {
          duration: t(silenceLabelKey(choice))
        })
      )
    },
    toggleBell() {
      if (this.bellOpen) return this.closeBell()
      this.bellOpen = true
    },
    closeBell() {
      this.bellOpen = false
      this.requests = this.requests.filter((r) => r.stage === 'show-code')
    },
    holdRequest(view) {
      const waiting = this.requests.some((r) => r.id === view?.id)
      const isNew = view?.role === 'holder' && view.stage === 'show-code' && !arePopupsShown(this)
      if (!waiting && !isNew) return false
      this.requests = [...withoutId(this.requests, view.id), view]
      return true
    },
    showRequest(request) {
      this.requests = withoutId(this.requests, request.id)
      this.bellOpen = false
      this.pairing = request
    },
    async stopSharing({ fp, name }) {
      this.confirmStop = null
      const res = await window.api.lanStopSharing(fp)
      if (!res?.ok) return
      await this.loadItems()
      useDiffStore().showNotice(t('lan.stop.done', { name }))
    },
    declineRequest(request) {
      this.requests = withoutId(this.requests, request.id)
      window.api.lanCancel(request.id)
    }
  }
})
