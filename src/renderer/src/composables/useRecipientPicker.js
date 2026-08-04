// The recipient picker's state and its keyboard guards, pulled OUT of
// ShareDiffDialog so they are unit-tested rather than left inline — the same
// reason useBackdropClose exists.
//
// The invariant this composable is built around: A FILTER MAY NEVER HIDE A
// SELECTION. `selected` is a set of fingerprints that survives every query;
// only `visible` narrows. Without that, ticking Ana and then typing "tom" seals
// for someone who is no longer on screen.
import { computed, ref } from 'vue'
import { filterRecipients } from '../utils/recipientSearch'

// One entry per key, so adding a shortcut cannot push the handler over the
// complexity cap. Each returns true when it consumed the event.
const KEY_ACTIONS = {
  ArrowDown: (p) => {
    p.move(1)
    return true
  },
  ArrowUp: (p) => {
    p.move(-1)
    return true
  },
  ' ': (p) => {
    const row = p.visible.value[p.activeIndex.value]
    if (!row) return false
    p.toggle(row.fingerprint)
    return true
  },
  Enter: (p, { onSubmit }) => {
    if (!p.canSubmit.value) return false
    onSubmit?.()
    return true
  },
  // Two-stage: a filtered list is a state the user wants to leave before they
  // want to leave the dialog.
  Escape: (p, { onClose }) => {
    if (p.query.value) {
      p.setQuery('')
      return true
    }
    onClose?.()
    return true
  }
}

function useSelection(recipients) {
  const selected = ref([])

  // Read off `recipients`, never off the filtered list: the chips must render a
  // picked recipient the current query excludes.
  const picked = computed(() =>
    (recipients.value ?? []).filter((r) => selected.value.includes(r.fingerprint))
  )

  const toggle = (fingerprint) => {
    if (!fingerprint) return
    selected.value = selected.value.includes(fingerprint)
      ? selected.value.filter((f) => f !== fingerprint)
      : [...selected.value, fingerprint]
  }

  // Drop selections for keys that no longer exist (one removed while the dialog
  // was open), and optionally pre-tick the one just added.
  const reconcile = (preferFingerprint) => {
    const known = (recipients.value ?? []).map((r) => r.fingerprint)
    selected.value = selected.value.filter((fp) => known.includes(fp))
    if (preferFingerprint && known.includes(preferFingerprint)) {
      if (!selected.value.includes(preferFingerprint)) {
        selected.value = [...selected.value, preferFingerprint]
      }
    } else if (!selected.value.length && known.length === 1) {
      selected.value = [known[0]]
    }
  }

  return { selected, picked, toggle, reconcile }
}

/**
 * @param {import('vue').Ref<object[]>} recipients
 * @param {{ withEmailOnly?: boolean }} [opts]
 */
export function useRecipientPicker(recipients, { withEmailOnly = false } = {}) {
  const query = ref('')
  const emailOnly = ref(withEmailOnly)
  const activeIndex = ref(0)
  const { selected, picked, toggle, reconcile } = useSelection(recipients)

  const visible = computed(() =>
    filterRecipients(recipients.value ?? [], {
      query: query.value,
      withEmailOnly: emailOnly.value
    })
  )

  const api = {
    query,
    emailOnly,
    selected,
    activeIndex,
    visible,
    picked,
    toggle,
    total: computed(() => (recipients.value ?? []).length),
    isFiltered: computed(() => visible.value.length !== (recipients.value ?? []).length),
    canSubmit: computed(() => picked.value.length > 0),
    everyPickedHasEmail: computed(
      () => picked.value.length > 0 && picked.value.every((r) => !!r.email)
    ),
    setQuery(next) {
      query.value = String(next ?? '')
      activeIndex.value = 0
    },
    setEmailOnly(next) {
      emailOnly.value = next === true
      activeIndex.value = 0
    },
    move(delta) {
      const count = visible.value.length
      if (!count) return
      activeIndex.value = (activeIndex.value + delta + count) % count
    },
    reconcile(preferFingerprint) {
      reconcile(preferFingerprint)
      activeIndex.value = visible.value.length
        ? Math.min(activeIndex.value, visible.value.length - 1)
        : 0
    },
    /**
     * Returns true when the key was consumed, so the caller knows whether to
     * preventDefault.
     * @param {KeyboardEvent} event
     * @param {{ onSubmit?: () => void, onClose?: () => void }} [handlers]
     */
    handleKey: (event, handlers = {}) => KEY_ACTIONS[event.key]?.(api, handlers) ?? false
  }
  return api
}
