// Emailing a sealed diff by handing off to the user's own mail client.
export { useEmailStore, DEFAULT_SUBJECT, DEFAULT_NOTE } from './emailStore'
export { default as EmailSettings } from './components/EmailSettings.vue'
export { default as EmailHandoffDialog } from './components/EmailHandoffDialog.vue'
