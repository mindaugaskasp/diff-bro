// Accept goes through the ordinary stores, so a proposal lands exactly as if the user had made it.
import { defineStore } from 'pinia'
import { useSnippetStore } from '../../stores/snippetStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useTabsStore } from '../../stores/tabsStore'
import { blankSnapshot } from '../../utils/tabs'

export const CLAUDE_SCOPES = ['snippets', 'diffs', 'compare', 'proposeSnippets', 'proposeDiffs']

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

let watching = false

export const useClaudeStore = defineStore('claude', {
  state: () => ({
    connection: null,
    confirming: false,
    error: null,
    activity: [],
    inbox: []
  }),
  getters: {
    enabled: (s) => s.connection?.enabled === true,
    scopes: (s) => s.connection?.scopes ?? noScopes()
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
    async preview(id) {
      const proposal = await this._read(id)
      if (proposal) useTabsStore().open(snapshotOf(proposal), { name: proposal.name })
    },
    async accept(id) {
      const proposal = await this._read(id)
      if (!proposal) return
      const saved =
        proposal.kind === 'snippet'
          ? await useSnippetStore().add({
              name: proposal.body.name,
              content: proposal.body.content,
              language: proposal.body.language ?? undefined,
              tags: proposal.body.tags
            })
          : await useVaultStore().save(proposal.body.name, null, snapshotOf(proposal))
      if (saved) await this.discard(id)
    },
    async discard(id) {
      await window.api.inboxDiscard(id)
      this.inbox = this.inbox.filter((p) => p.id !== id)
    }
  }
})
