import { computed, ref } from 'vue'
import { useSnippetStore, MAX_TAGS, TAG_PALETTE, cleanTag } from '../stores/snippetStore'

// The snippet editor's tag chips field. Colors for new tags are held locally and
// only written to the registry on save, so abandoning the editor leaves no stray.
/**
 * @param {string[]} initial tags the snippet already carries
 * @returns {import('../types').TagField}
 */
export function useTagInput(initial = []) {
  const store = useSnippetStore()
  const tags = ref([...initial])
  const input = ref('')
  const inputEl = ref(null)
  const tentativeColors = ref({})

  const canAddMore = computed(() => tags.value.length < MAX_TAGS)

  // Existing tags not already applied, matching what's typed, recent-first.
  const suggestions = computed(() => {
    const q = input.value.trim().toLowerCase()
    return store.tagList
      .map((t) => t.name)
      .filter((n) => !tags.value.includes(n) && n.includes(q))
      .slice(0, 8)
  })

  // Display color: the registry color if the tag exists, else its tentative one.
  function colorFor(t) {
    return store.colorOf(t) || tentativeColors.value[t] || 'var(--text-dim)'
  }
  function nextTentativeColor() {
    const used = new Set([
      ...Object.values(store.tags).map((t) => t.color),
      ...Object.values(tentativeColors.value)
    ])
    return TAG_PALETTE.find((c) => !used.has(c)) ?? TAG_PALETTE[0]
  }

  function add(raw) {
    if (!canAddMore.value) return
    const n = cleanTag(raw)
    if (!n || tags.value.includes(n)) {
      input.value = ''
      return
    }
    if (!store.colorOf(n) && !tentativeColors.value[n]) {
      tentativeColors.value = { ...tentativeColors.value, [n]: nextTentativeColor() }
    }
    tags.value.push(n)
    input.value = ''
  }
  function remove(t) {
    tags.value = tags.value.filter((x) => x !== t)
  }

  // Space and comma commit like Enter, so no tag stays behind as typed text.
  function onKey(e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
      e.preventDefault()
      if (input.value.trim()) add(input.value)
    } else if (e.key === 'Backspace' && !input.value && tags.value.length) {
      tags.value.pop()
    }
  }
  // Leaving the field commits what was typed rather than silently dropping it.
  function onBlur() {
    if (input.value.trim()) add(input.value)
  }

  // Colors to persist on save: only for tags the registry doesn't know yet.
  function newColors() {
    const out = {}
    for (const t of tags.value) {
      if (!store.colorOf(t) && tentativeColors.value[t]) out[t] = tentativeColors.value[t]
    }
    return out
  }

  return {
    tags,
    input,
    inputEl,
    canAddMore,
    suggestions,
    colorFor,
    add,
    remove,
    onKey,
    onBlur,
    newColors
  }
}
