// Sending a diff to someone and trusting the keys that make it possible. The
// sealing itself lives in main (src/main/sealing.js) behind IPC — nothing here
// touches key material, and nothing here decides who a file is sealed for
// beyond passing the fingerprints the user chose.

import { toRaw } from 'vue'
import { defineStore } from 'pinia'
import { useDiffStore } from '../../stores/diffStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useEmailStore } from '../email'
import { SHARE_ERRORS } from '../../utils/shareErrors'

export const useShareStore = defineStore('share', {
  state: () => ({
    // The save step of "share current diff" defers to the recipient picker.
    saveThenShare: false,
    shareEntryId: null,
    shareDraft: null,
    // { key, fingerprint, label } while the name dialog is open.
    pendingTrustedKey: null,
    pendingUntrust: null,
    // Flags the just-added key so the manager can highlight it.
    lastAddedTrustedFp: null,
    showTrustedKeysDialog: false,
    showShareKeyDialog: false,
    showRotateKeyDialog: false
  }),
  actions: {
    // Save first (a share file needs a name + expiry), then the recipient picker.
    shareCurrent() {
      const diff = useDiffStore()
      if (!diff.canSave) {
        diff.showNotice('Nothing to share yet — load two files or paste some text first.')
        return
      }
      this.saveThenShare = true
      diff.showSaveDialog = true
    },
    // Opens the recipient picker (a share file is sealed for one recipient).
    // With no trusted keys yet, the dialog walks through the one-time setup.
    shareEntry(id) {
      this.shareEntryId = id
    },
    // The save step of the "share current diff" flow captured this draft instead of
    // persisting — opening the recipient picker with it pending (see SaveDiffDialog).
    beginShareDraft(draft) {
      this.shareDraft = draft
    },
    noticeBadEmail() {
      useDiffStore().showNotice(
        'That is not a usable email address — it was not saved. Check for a stray space or comma.'
      )
    },
    // Close the share dialog without sharing (both entry points).
    dismissShare() {
      this.shareEntryId = null
      this.shareDraft = null
    },
    // Direction is share → email and never back. Fingerprints go over IPC; main
    // resolves the real addresses from the trust store, so `picked` is display-only.
    async emailTo(recipientFps, picked) {
      const diff = useDiffStore()
      const vault = useVaultStore()
      const to = (Array.isArray(recipientFps) ? [...recipientFps] : [recipientFps]).filter(Boolean)
      if (!to.length) return
      const draft = this.shareDraft
      const id = this.shareEntryId
      const entry = draft ? vault.draftEntry(draft) : id ? await vault.entryForShare(id) : null
      if (!entry) {
        diff.showNotice('That diff could not be read — nothing was sealed.')
        return
      }
      // Runs only once main has written the file.
      const onSealed = async () => {
        if (draft) {
          const saved = await vault.saveShareTwin(draft, to)
          if (saved) diff.markSaved()
          return saved
        }
        vault.recordShare(id, to)
        return true
      }
      const opened = useEmailStore().compose({
        entry,
        recipientFps: to,
        to: (picked ?? []).map(({ fingerprint, label, email }) => ({ fingerprint, label, email })),
        onSealed
      })
      if (opened) this.dismissShare()
    },
    async shareTo(recipientFps) {
      const diff = useDiffStore()
      // A plain array of strings: a reactive one is a Proxy, which structured
      // clone refuses at the IPC boundary.
      const to = (Array.isArray(recipientFps) ? [...recipientFps] : [recipientFps]).filter(Boolean)
      if (!to.length) return
      const vault = useVaultStore()
      const draft = this.shareDraft
      const id = this.shareEntryId
      this.shareDraft = null
      this.shareEntryId = null
      const res = draft ? await vault.shareDraft(draft, to) : await vault.share(id, to)
      if (res.ok) {
        if (draft && res.localCopy !== false) diff.markSaved()
        // The sealed file is sent either way; only the local twin can fail here,
        // and saying so is the difference between "shared" and "shared, and you
        // have no copy of what you sent".
        diff.showNotice(
          res.localCopy === false
            ? `Sealed shared diff for "${res.to}" written to ${res.path} — but your own copy could not be saved, so this diff is not in your saved list.`
            : `Sealed shared diff for "${res.to}" written to ${res.path}`
        )
      } else if (res.error) {
        diff.showNotice(SHARE_ERRORS[res.error] ?? 'Sharing failed.')
      }
    },
    // Import a sealed diff and open it — but only when nothing is on screen; with
    // a diff loaded, keep the view and leave it in External diffs.
    async importShared() {
      const diff = useDiffStore()
      const res = await useVaultStore().importShared()
      if (!res.ok) {
        if (res.error) diff.showNotice(SHARE_ERRORS[res.error] ?? 'Import failed.')
        return
      }
      if (diff.hasActive) {
        diff.showNotice(
          `Imported "${res.entry.name}" from ${res.from} into External diffs — kept your current diff open; select it there to view.`
        )
        return
      }
      await this._openImported(res)
      diff.showNotice(`Opened "${res.entry.name}" from ${res.from} — same expiry as on the sender.`)
    },
    // A dropped .diffbro opens straight away (a drop is an explicit "show me
    // this", so unlike menu-import it ignores hasActive).
    async receiveDroppedSharedDiff(path) {
      const diff = useDiffStore()
      const res = await useVaultStore().importSharedFromPath(path)
      if (!res.ok) {
        if (res.error) diff.showNotice(SHARE_ERRORS[res.error] ?? 'Import failed.')
        return
      }
      await this._openImported(res)
      diff.showNotice(
        `Imported "${res.entry.name}" from ${res.from} — same expiry as on the sender.`
      )
    },
    // Decrypt a just-imported share and show it (shared by drop + menu paths).
    async _openImported(res) {
      const diff = useDiffStore()
      const payload = await useVaultStore().load(res.id)
      if (payload) diff.restore(payload)
    },
    // Export this install's public key, tagged with the user's display name.
    async runExportKey(label) {
      const diff = useDiffStore()
      const res = await window.api.exportPublicKey(label)
      if (res.ok) {
        this.showShareKeyDialog = false
        diff.showNotice(
          `Your public key was saved. Send this file to the other person — they import it. To receive their diffs, import THEIR key (Security → Add Trusted Key).`
        )
      }
    },
    async runCopyKey(label) {
      const diff = useDiffStore()
      const res = await window.api.copyPublicKey(label)
      if (res.ok) {
        this.showShareKeyDialog = false
        diff.showNotice(
          `Your public key was copied. Send it to the other person — they import it. To receive their diffs, import THEIR key.`
        )
      }
    },
    // Pick a key file, then require a name before adding.
    async addTrustedKey() {
      const diff = useDiffStore()
      const res = await window.api.addTrustedKey()
      if (res.ok) {
        this.pendingTrustedKey = {
          key: res.key,
          fingerprint: res.fingerprint,
          label: res.defaultLabel,
          vouchedBy: res.vouchedBy ?? null
        }
      } else if (res.error === 'own-key') {
        diff.showNotice("That's your own public key — you don't need to trust yourself.")
      } else if (res.error) {
        diff.showNotice('That file is not a valid public key.')
      }
    },
    // A dropped .diffbrokey: validate, then open the naming dialog before adding.
    async receiveDroppedKey(path) {
      const diff = useDiffStore()
      const res = await window.api.readKeyFile(path)
      if (res.ok) {
        this.pendingTrustedKey = {
          key: res.key,
          fingerprint: res.fingerprint,
          label: res.defaultLabel,
          vouchedBy: res.vouchedBy ?? null
        }
      } else if (res.error === 'own-key') {
        diff.showNotice("That's your own public key — you don't need to trust yourself.")
      } else {
        diff.showNotice('That file is not a valid Diff Bro public key.')
      }
    },
    async confirmTrustedKey(label) {
      const diff = useDiffStore()
      const pending = this.pendingTrustedKey
      if (!pending) return
      // toRaw: the pending key lives in reactive state, and a Proxy can't cross
      // the structured-clone boundary — sending one rejects the IPC call.
      let res
      try {
        res = await window.api.addTrustedKeyNamed(toRaw(pending.key), label)
      } catch {
        res = { error: 'ipc' }
      }
      // Cleared only after the write, or the manager re-reads before the key lands.
      this.pendingTrustedKey = null
      if (res.ok) {
        diff.showNotice(`Now trusting "${res.label}" (${res.fingerprint}).`)
        // Flag the new key so the manager highlights it.
        this.lastAddedTrustedFp = res.fingerprint
        this.showTrustedKeysDialog = true
      } else diff.showNotice('Could not add that key.')
    },
    cancelTrustedKey() {
      this.pendingTrustedKey = null
    }
  }
})
