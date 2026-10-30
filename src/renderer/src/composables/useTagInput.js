import { computed, ref } from 'vue'
import { useSnippetStore, MAX_TAGS, TAG_PALETTE, cleanTag } from '../stores/snippetStore'
import { MAX_TAG_DEPTH, isTagTooDeep, tagPath } from '../utils/tagTree'

// The snippet editor's tag chips field. Colors for new tags are held locally and
// only written to the registry on save, so abandoning the editor leaves no stray.
function nextTentativeColor(registry, tentative) {
  const used = new Set([
    ...Object.values(registry).map((t) => t.color),
    ...Object.values(tentative)
  ])
  return TAG_PALETTE.find((c) => !used.has(c)) ?? TAG_PALETTE[0]
}

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
  // The deepest the refused path could go, while a fourth level is refused.
  const tooDeep = ref('')

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

  function add(raw) {
    if (!canAddMore.value) return
    const n = cleanTag(raw)
    tooDeep.value = n && isTagTooDeep(n) ? tagPath(n).slice(0, MAX_TAG_DEPTH).join('/') : ''
    if (tooDeep.value) return
    if (!n || tags.value.includes(n)) {
      input.value = ''
      return
    }
    if (!store.colorOf(n) && !tentativeColors.value[n]) {
      const color = nextTentativeColor(store.tags, tentativeColors.value)
      tentativeColors.value = { ...tentativeColors.value, [n]: color }
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
    tooDeep,
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
