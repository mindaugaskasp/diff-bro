// Accept goes through the ordinary stores, so a proposal lands exactly as if the user had made it.
import { defineStore } from 'pinia'
import { useSnippetStore } from '../../stores/snippetStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useTabsStore } from '../../stores/tabsStore'
import { blankSnapshot } from '../../utils/tabs'

export const CLAUDE_SCOPES = ['snippets', 'diffs', 'compare', 'proposeSnippets', 'proposeDiffs']
// How long an accept or discard can be undone before the inbox file goes.
export const UNDO_MS = 8000
let undoTimer = null

const noScopes = () => Object.fromEntries(CLAUDE_SCOPES.map((s) => [s, false]))

const snapshotOf = (proposal) => {
  const { body } = proposal
  const isComparison = proposal.kind === 'comparison'
  return {
    ...blankSnapshot(),
    mode: 'paste',
    pasteLeft: isComparison ? body.left : body.content,
    pasteRight: isComparison ? body.right : '',
    pasteLeftName: body.name
  }
}

const draftOf = ({ body }) => ({
  id: null,
  initialName: body.name,
  initialContent: body.content,
  initialLanguage: body.language ?? 'auto',
  initialTags: body.tags ?? []
})

let watching = false

export const useClaudeStore = defineStore('claude', {
  state: () => ({
    connection: null,
    confirming: false,
    error: null,
    activity: [],
    inbox: [],
    // Acted on but still undoable: off the list, not yet out of the inbox.
    hidden: [],
    selected: [],
    undoable: null,
    // Tab id → the proposal it is reviewing.
    reviewing: {},
    apps: null,
    connecting: '',
    connectResult: null
  }),
  getters: {
    enabled: (s) => s.connection?.enabled === true,
    scopes: (s) => s.connection?.scopes ?? noScopes(),
    pending: (s) => s.inbox.filter((p) => !s.hidden.includes(p.id)),
    snippetProposals() {
      return this.pending.filter((p) => p.kind === 'snippet')
    },
    diffProposals() {
      return this.pending.filter((p) => p.kind === 'comparison')
    }
  },
  actions: {
    async loadConnection() {
      this.connection = await window.api.claudeConnection()
    },
    requestEnable() {
      this.confirming = true
    },
    cancelEnable() {
      this.confirming = false
    },
    async confirmEnable() {
      this.confirming = false
      await this._save({ enabled: true, scopes: this.scopes })
    },
    async disable() {
      await this._save({ enabled: false, scopes: noScopes() })
    },
    async setScope(scope, on) {
      if (!this.enabled || !CLAUDE_SCOPES.includes(scope)) return
      await this._save({ enabled: true, scopes: { ...this.scopes, [scope]: on === true } })
    },
    // A reactive scopes object is a Proxy, which IPC's structured clone refuses.
    async _save({ enabled, scopes }) {
      const res = await window.api.setClaudeConnection({ enabled, scopes: { ...scopes } })
      this.error = res?.error ?? null
      if (!res?.error) this.connection = res
    },
    async loadApps() {
      this.apps = await window.api.claudeApps()
    },
    async connectApp(target) {
      this.connecting = target
      this.connectResult = null
      const res = await window.api.connectClaudeApp(target)
      this.connecting = ''
      if (res?.apps) this.apps = res.apps
      if (!res?.canceled) this.connectResult = { target, outcome: res?.error ?? 'ok' }
    },
    async loadActivity() {
      this.activity = await window.api.claudeActivity()
    },
    async clearActivity() {
      await window.api.clearClaudeActivity()
      this.activity = []
    },
    async loadInbox() {
      if (!watching && window.api?.onInboxChanged) {
        watching = true
        window.api.onInboxChanged(() => this.loadInbox())
      }
      this.inbox = (await window.api?.inboxList?.()) ?? []
    },
    async _read(id) {
      const proposal = await window.api.inboxRead(id)
      if (!proposal) await this.loadInbox()
      return proposal
    },
    async open(id) {
      const proposal = await this._read(id)
      if (!proposal) return
      const tabs = useTabsStore()
      const tabId =
        proposal.kind === 'snippet'
          ? tabs.openSnippet(draftOf(proposal), proposal.name)
          : tabs.open(snapshotOf(proposal), { name: proposal.name })
      if (tabId) this.reviewing = { ...this.reviewing, [tabId]: id }
    },
    stopReviewing(tabId) {
      this.reviewing = Object.fromEntries(
        Object.entries(this.reviewing).filter(([id]) => id !== tabId)
      )
    },
    async _keep(id) {
      const proposal = await this._read(id)
      if (!proposal) return null
      const savedId =
        proposal.kind === 'snippet'
          ? await useSnippetStore().add({
              name: proposal.body.name,
              content: proposal.body.content,
              language: proposal.body.language ?? undefined,
              tags: proposal.body.tags
            })
          : await useVaultStore().save(proposal.body.name, null, snapshotOf(proposal))
      return savedId ? { id, kind: proposal.kind, name: proposal.name, savedId } : null
    },
    async accept(id) {
      const kept = await this._keep(id)
      if (kept) this._settle([kept], 'accepted')
    },
    // The proposed tab saves the reader's own version; this files the proposal away.
    settleAccepted(id, savedId) {
      const p = this.inbox.find((x) => x.id === id)
      this._settle([{ id, kind: p?.kind ?? 'snippet', name: p?.name ?? '', savedId }], 'accepted')
    },
    discard(id) {
      const p = this.inbox.find((x) => x.id === id)
      this._settle([{ id, name: p?.name ?? '' }], 'discarded')
    },
    toggleSelected(id) {
      const on = this.selected.includes(id)
      this.selected = on ? this.selected.filter((x) => x !== id) : [...this.selected, id]
    },
    async acceptSelected() {
      const ids = this.selected
      this.selected = []
      const kept = []
      for (const id of ids) kept.push(await this._keep(id))
      if (kept.some(Boolean)) this._settle(kept.filter(Boolean), 'accepted')
    },
    discardSelected() {
      const items = this.pending.filter((p) => this.selected.includes(p.id))
      this.selected = []
      if (items.length)
        this._settle(
          items.map((p) => ({ id: p.id, name: p.name })),
          'discarded'
        )
    },
    _settle(items, verb) {
      if (this.undoable) this._finalize()
      this.hidden = [...new Set([...this.hidden, ...items.map((i) => i.id)])]
      this.undoable = { verb, n: items.length, name: items[0].name, items }
      undoTimer = setTimeout(() => this._finalize(), UNDO_MS)
    },
    async _finalize() {
      const u = this.undoable
      clearTimeout(undoTimer)
      this.undoable = null
      if (!u) return
      const ids = u.items.map((i) => i.id)
      this.inbox = this.inbox.filter((p) => !ids.includes(p.id))
      this.hidden = this.hidden.filter((id) => !ids.includes(id))
      for (const id of ids) await window.api.inboxDiscard(id)
    },
    async undo() {
      const u = this.undoable
      if (!u) return
      clearTimeout(undoTimer)
      this.undoable = null
      for (const item of u.items) {
        if (!item.savedId) continue
        if (item.kind === 'snippet') useSnippetStore().remove(item.savedId)
        else useVaultStore().remove(item.savedId)
      }
      const ids = u.items.map((i) => i.id)
      this.hidden = this.hidden.filter((id) => !ids.includes(id))
    }
  }
})
