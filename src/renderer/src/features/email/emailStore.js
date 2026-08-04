// Emailing a sealed diff. Diff Bro does not send: main seals the file, opens the
// user's own mail client on an addressed message, and copies the file so it can
// be pasted in. This store owns the message defaults and the compose dialog —
// it knows nothing about keys, sealing or the vault (that is the share slice).

import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../../persist'
import { useDiffStore } from '../../stores/diffStore'

export const DEFAULT_SUBJECT = 'Sealed diff: {name}'
export const DEFAULT_NOTE = ''

// The file exists whenever a path came back; not saying so orphans it.
function failureNotice(res) {
  if (res.error === 'no-address') return `No email address for ${(res.who || []).join(', ')}.`
  const why = HANDOFF_ERRORS[res.error] || 'Could not open your mail app.'
  return res.path ? `${why} The sealed file is saved as ${res.name || res.path}.` : why
}

function handoffNotice(res, localCopy) {
  if (res.canceled) {
    return res.path
      ? 'Nothing was opened. The sealed file is saved.'
      : 'Cancelled — nothing was sealed or saved.'
  }
  if (!res.ok) return failureNotice(res)
  if (localCopy === false) {
    return `${res.name} is on the clipboard and your message is open — but your own copy could not be saved, so this diff is not in your saved list.`
  }
  return res.copied
    ? `Your message is open in your mail app and ${res.name} is on the clipboard — paste it in.`
    : `Your message is open in your mail app. ${res.name} is saved — attach it from there.`
}

// The decrypted snapshot and the callback are held OUTSIDE Pinia state, keyed
// to the open draft. Two reasons, and both are load-bearing:
//   1. Reactive state deep-proxies what you put in it, and structured clone
//      REFUSES a Proxy at the IPC boundary — `toRaw` is shallow, so a nested
//      `snapshot` read off a reactive draft still crossed as one and the whole
//      hand-off rejected. Only a real launch can catch that.
//   2. It is plaintext. It has no business being reactive, observable, or
//      living any longer than the dialog it belongs to.
let pending = null

const HANDOFF_ERRORS = {
  'unknown-recipient': 'One of those recipients is no longer a trusted key.',
  'bad-address': 'That address could not be used — check it under Security → Trusted keys.',
  'note-too-long': 'That note is too long for a mail link — shorten it and try again.',
  'no-mail-app': 'No mail app is set up to handle links on this machine.',
  'invalid-ttl': 'Rejected: shared diffs cannot live longer than a week.',
  expired: 'This diff has already expired.',
  'identity-unavailable':
    'Your identity key couldn’t be unlocked (the OS keychain may be locked). Nothing was changed — unlock it and try again.'
}

function readState() {
  let parsed
  try {
    parsed = JSON.parse(loadPersisted('email') ?? '{}') || {}
  } catch {
    parsed = {}
  }
  return {
    subjectTemplate:
      typeof parsed.subjectTemplate === 'string' ? parsed.subjectTemplate : DEFAULT_SUBJECT,
    noteTemplate: typeof parsed.noteTemplate === 'string' ? parsed.noteTemplate : DEFAULT_NOTE,
    revealAfterCreate: parsed.revealAfterCreate !== false,
    // The compose dialog's draft: { entry, recipientFps, to } while open.
    draft: null,
    sending: false
  }
}

export const useEmailStore = defineStore('email', {
  state: () => readState(),
  actions: {
    persist() {
      savePersisted(
        'email',
        JSON.stringify({
          subjectTemplate: this.subjectTemplate,
          noteTemplate: this.noteTemplate,
          revealAfterCreate: this.revealAfterCreate
        })
      )
    },
    setSubjectTemplate(value) {
      this.subjectTemplate = typeof value === 'string' ? value : DEFAULT_SUBJECT
      this.persist()
    },
    setNoteTemplate(value) {
      this.noteTemplate = typeof value === 'string' ? value : DEFAULT_NOTE
      this.persist()
    },
    setRevealAfterCreate(value) {
      this.revealAfterCreate = value === true
      this.persist()
    },
    resetTemplates() {
      this.subjectTemplate = DEFAULT_SUBJECT
      this.noteTemplate = DEFAULT_NOTE
      this.revealAfterCreate = true
      this.persist()
    },
    // Open the compose dialog. `to` is display-only — main resolves the real
    // addresses from the trust store, so a stale one here can never be used.
    // `onSealed` is supplied by the caller (the share slice) and runs only after
    // a file was actually written: it is how a draft saves its local twin
    // without this slice importing the one that owns the vault.
    compose({ entry, recipientFps, to, onSealed }) {
      const missing = (to ?? []).filter((r) => !r.email)
      if (missing.length) {
        useDiffStore().showNotice(
          `No email address for ${missing.map((r) => r.label).join(', ')} — add one under Security → Trusted keys.`
        )
        return false
      }
      pending = { entry, onSealed }
      // State holds only what the dialog DRAWS.
      this.draft = { recipientFps: [...recipientFps], to: [...(to ?? [])] }
      return true
    },
    cancel() {
      pending = null
      this.draft = null
    },
    async invokeHandoff(draft, note) {
      try {
        return (
          (await window.api.mailHandoff({
            entry: pending?.entry,
            recipientFps: [...draft.recipientFps],
            subjectTemplate: this.subjectTemplate,
            reveal: this.revealAfterCreate,
            note
          })) || {}
        )
      } catch {
        return { error: 'ipc' }
      }
    },
    async send(note) {
      const draft = this.draft
      if (!draft || this.sending) return
      this.sending = true
      const res = await this.invokeHandoff(draft, note)
      this.sending = false
      // Only a WRITTEN file is a share (the invariant vaultStore.share holds).
      // Two different cancels reach here: the OS save dialog, which wrote
      // nothing, and the hand-off confirm, which is after the write — and only
      // the second carries a path. Treating them alike saved a local twin and
      // recorded a share for a file that never existed.
      const written = res.ok === true || !!res.path
      const localCopy = written ? await pending?.onSealed?.() : undefined
      if (written) {
        pending = null
        this.draft = null
      }
      useDiffStore().showNotice(handoffNotice(res, localCopy))
    }
  }
})
