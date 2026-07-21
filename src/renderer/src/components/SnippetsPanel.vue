<script setup>
import { computed, ref } from 'vue'
import { useSnippetStore, TAG_PALETTE } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import TagGlyph from './TagGlyph.vue'

const store = useSnippetStore()
const diff = useDiffStore()

const query = ref('')
const activeTags = ref(new Set()) // tag names, plus the '' marker for Default
const DEFAULT = '__DEFAULT__' // sentinel for the untagged filter (never a real, lowercased tag)

function toggleTag(name) {
  const next = new Set(activeTags.value)
  next.has(name) ? next.delete(name) : next.add(name)
  activeTags.value = next
  if (name !== DEFAULT && next.has(name)) store.touchTag(name) // used → recent
}
function clearTags() {
  activeTags.value = new Set()
}

// --- Quick Access: drag tags from the Recent shelf here (and reorder) ---
const dragging = ref(null)
function onDragStart(e, name) {
  if (name === DEFAULT) {
    e.preventDefault()
    return
  }
  dragging.value = name
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', name)
}
function onDropQuick(e, beforeName = null) {
  e.preventDefault()
  const name = dragging.value
  dragging.value = null
  if (name) store.pinTag(name, beforeName)
}

function matches(entry) {
  const q = query.value.trim().toLowerCase()
  const byText =
    !q ||
    entry.name.toLowerCase().includes(q) ||
    entry.tags.some((t) => t.includes(q)) ||
    (!entry.tags.length && 'default'.includes(q))
  const has = (t) => (t === DEFAULT ? entry.tags.length === 0 : entry.tags.includes(t))
  const byTags = activeTags.value.size === 0 || [...activeTags.value].every(has)
  return byText && byTags
}

const visibleFavorites = computed(() => store.favorites.filter(matches))
const visibleListed = computed(() => store.listed.filter(matches))
const anyVisible = computed(() => visibleFavorites.value.length || visibleListed.value.length)

// Shelf: Default catch-all pinned first, then tags newest/just-used first.
const shelf = computed(() => [
  { name: DEFAULT, label: 'Default', color: null, count: store.defaultCount },
  ...store.tagList.map((t) => ({ name: t.name, label: t.name, color: t.color, count: t.count }))
])

function newSnippet() {
  store.editingSnippet = { id: null }
}
function editSnippet(id) {
  store.editingSnippet = { id }
}
async function copySnippet(id) {
  const content = await store.load(id)
  if (content != null) {
    await navigator.clipboard.writeText(content)
    diff.showNotice('Copied snippet to clipboard.')
  }
}

// --- tag management popover (right-click a tag chip) ---
const managing = ref(null) // { name, color }
const renameValue = ref('')
function openManage(e, name) {
  if (name === DEFAULT) return // Default is permanent
  e.preventDefault()
  renameValue.value = name
  managing.value = { name, color: store.colorOf(name) }
}
function closeManage() {
  managing.value = null
}
function applyRename() {
  const to = renameValue.value.trim().toLowerCase()
  if (to && to !== managing.value.name) store.renameTag(managing.value.name, to)
  closeManage()
}
function applyColor(color) {
  store.recolorTag(managing.value.name, color)
  managing.value = { ...managing.value, color }
}
function deleteTag() {
  store.requestDelete('tag', managing.value.name, managing.value.name)
  closeManage()
}
function exportTag() {
  store.pendingExport = { tag: managing.value.name }
  closeManage()
}
</script>

<template>
  <div class="snippets-section">
    <div class="head sub"><span>Snippets</span></div>
    <div class="head-actions">
      <button class="action primary" title="Create a new snippet" @click="newSnippet">
        + New snippet
      </button>
    </div>
    <div class="head-actions secondary">
      <button
        class="action"
        title="Export all snippets to a passphrase-protected file"
        @click="store.pendingExport = { all: true }"
      >
        Export
      </button>
      <button
        class="action"
        title="Import snippets from a file"
        @click="store.pendingImport = true"
      >
        Import
      </button>
    </div>

    <div v-if="store.entries.length" class="filter">
      <input
        v-model="query"
        type="search"
        placeholder="Filter by name or tag…"
        spellcheck="false"
      />
    </div>

    <p v-if="!store.entries.length" class="empty">
      Press <strong>New snippet</strong> to create one — saved encrypted, tagged however you like,
      and exportable as a passphrase-protected file.
    </p>

    <ul v-if="visibleFavorites.length" class="favorites-group">
      <li class="fav-head">★ Favorites</li>
      <li v-for="entry in visibleFavorites" :key="entry.id" class="snippet favorite">
        <button class="star on" title="Unfavorite" @click="store.toggleFavorite(entry.id)">
          ★
        </button>
        <button
          class="entry"
          :title="entry.tags.length ? entry.tags.join(', ') : 'Default'"
          @click="editSnippet(entry.id)"
        >
          <span class="nm">{{ entry.name }}</span>
          <span class="glyphs">
            <TagGlyph v-for="t in entry.tags" :key="t" :color="store.colorOf(t)" />
            <TagGlyph v-if="!entry.tags.length" class="faint" />
          </span>
        </button>
        <button class="row-btn" title="Copy to clipboard" @click="copySnippet(entry.id)">⧉</button>
        <button
          class="row-btn delete"
          title="Delete"
          @click="store.requestDelete('snippet', entry.id, entry.name)"
        >
          ×
        </button>
      </li>
    </ul>

    <ul v-if="store.entries.length" class="snippet-list">
      <li v-if="!anyVisible" class="empty small">No snippets match.</li>
      <li v-for="entry in visibleListed" :key="entry.id" class="snippet">
        <button class="star" title="Favorite (pin to top)" @click="store.toggleFavorite(entry.id)">
          ☆
        </button>
        <button
          class="entry"
          :title="entry.tags.length ? entry.tags.join(', ') : 'Default'"
          @click="editSnippet(entry.id)"
        >
          <span class="nm">{{ entry.name }}</span>
          <span class="glyphs">
            <TagGlyph v-for="t in entry.tags" :key="t" :color="store.colorOf(t)" />
            <TagGlyph v-if="!entry.tags.length" class="faint" />
          </span>
        </button>
        <button class="row-btn" title="Copy to clipboard" @click="copySnippet(entry.id)">⧉</button>
        <button
          class="row-btn delete"
          title="Delete"
          @click="store.requestDelete('snippet', entry.id, entry.name)"
        >
          ×
        </button>
      </li>
    </ul>

    <!-- Quick Access: pinned tags, drag here from Recent; reorder by dragging. -->
    <div
      v-if="store.entries.length"
      class="tagbar quick"
      @dragover.prevent
      @drop="onDropQuick($event)"
    >
      <div class="tagbar-head">
        <span>Quick access</span>
        <span class="hint">drag tags here</span>
      </div>
      <div class="chips">
        <div
          v-for="t in store.pinnedShelf"
          :key="t.name"
          class="chip pinned"
          :style="{ '--tc': t.color }"
          :aria-pressed="activeTags.has(t.name)"
          draggable="true"
          :title="`Filter by ${t.name} · drag to reorder`"
          @click="toggleTag(t.name)"
          @dragstart="onDragStart($event, t.name)"
          @dragover.prevent
          @drop.stop="onDropQuick($event, t.name)"
        >
          <TagGlyph :color="t.color" />
          {{ t.name }}<span class="ct">{{ t.count }}</span>
          <button
            type="button"
            class="unpin"
            title="Remove from quick access"
            @click.stop="store.unpinTag(t.name)"
          >
            ×
          </button>
        </div>
        <span v-if="!store.pinnedShelf.length" class="quick-empty">
          Drag a tag from below for one-click access.
        </span>
      </div>
    </div>

    <!-- Tag shelf: pinned below the list, newest / just-used first. -->
    <div v-if="store.entries.length" class="tagbar">
      <div class="tagbar-head">
        <span>Tags <span class="hint">· recent first</span></span>
        <button v-if="activeTags.size" class="clear" @click="clearTags">clear</button>
      </div>
      <div class="chips">
        <button
          v-for="t in shelf"
          :key="t.name"
          class="chip"
          :class="{ def: t.name === DEFAULT }"
          :style="t.color ? { '--tc': t.color } : {}"
          :aria-pressed="activeTags.has(t.name)"
          :draggable="t.name !== DEFAULT"
          :title="
            t.name === DEFAULT
              ? 'Untagged snippets'
              : `Filter by ${t.label} · drag to Quick access · right-click to manage`
          "
          @click="toggleTag(t.name)"
          @dragstart="onDragStart($event, t.name)"
          @contextmenu="openManage($event, t.name)"
        >
          <TagGlyph :color="t.color || 'var(--text-dim)'" />
          {{ t.label }}<span class="ct">{{ t.count }}</span>
        </button>
      </div>
    </div>

    <!-- Manage-tag popover -->
    <div v-if="managing" class="manage-backdrop" @click="closeManage">
      <div class="manage" @click.stop>
        <div class="manage-head">
          <span>Manage tag</span>
          <button class="close-x" @click="closeManage">×</button>
        </div>
        <input
          v-model="renameValue"
          class="rename"
          type="text"
          spellcheck="false"
          placeholder="Tag name"
          @keyup.enter="applyRename"
        />
        <div class="swatches">
          <button
            v-for="c in TAG_PALETTE"
            :key="c"
            class="swatch"
            :style="{ background: c }"
            :aria-pressed="managing.color === c"
            :title="c"
            @click="applyColor(c)"
          ></button>
        </div>
        <div class="manage-actions">
          <button class="mbtn danger" @click="deleteTag">Delete tag</button>
          <span class="spacer" />
          <button class="mbtn" @click="exportTag">Export…</button>
          <button class="mbtn primary" @click="applyRename">Rename</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.snippets-section {
  display: flex;
  flex-direction: column;
}
/* Matches the section-header band in SavedDiffs.vue so Snippets reads as a
   sibling section (recessed strip framed by hairlines, gap above the seam). */
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 10px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.head.sub {
  margin-top: 12px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 8px;
}
.action {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 6px;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.action:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-hover);
}
.action.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 8px;
}
.action.primary:hover {
  filter: brightness(1.08);
  color: #fff;
}
.filter {
  padding: 0 10px 8px;
}
.filter input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 5px 8px;
  font-size: 12.5px;
}
.filter input:focus {
  outline: none;
  border-color: var(--accent);
}
.empty {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}
.empty.small {
  padding: 8px 10px;
  font-size: 11.5px;
}
.favorites-group,
.snippet-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.fav-head {
  padding: 6px 10px 3px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #d29922;
}
.snippet {
  display: flex;
  align-items: stretch;
}
.snippet.favorite {
  background: color-mix(in srgb, #d29922 12%, transparent);
  box-shadow: inset 3px 0 0 #d29922;
}
.star {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0 4px 0 8px;
}
.star:hover {
  color: #d29922;
  background: var(--bg-hover);
}
.star.on {
  color: #d29922;
}
.entry {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-dim);
  padding: 5px 4px 5px 6px;
  cursor: pointer;
  font-size: 12.5px;
}
.entry:hover {
  background: var(--bg);
  color: var(--text);
}
.nm {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.glyphs {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}
.glyphs .faint {
  opacity: 0.45;
  color: var(--text-hint);
}
.row-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 15px;
  padding: 0 8px;
}
.row-btn:hover {
  color: var(--accent);
}
.row-btn.delete:hover {
  color: #f85149;
}
.tagbar {
  margin-top: 12px;
  padding: 10px 10px 12px;
  border-top: 1px solid var(--border);
}
.tagbar-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-hint);
  margin-bottom: 7px;
}
.tagbar-head .hint {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  font-size: 9.5px;
}
.clear {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
  font-size: 10.5px;
  padding: 0;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tc) 45%, transparent);
  background: color-mix(in srgb, var(--tc) 12%, transparent);
  color: color-mix(in srgb, var(--tc) 72%, var(--text));
  font-family: inherit;
}
.chip.def {
  --tc: var(--text-dim);
  color: var(--text-dim);
  background: none;
  border-color: var(--border);
}
.chip .ct {
  color: var(--text-hint);
  font-weight: 500;
}
/* Selected = a raised tint, not a solid block. A moderate fill plus a
   full-strength border and inset ring reads clearly as "active" while staying
   easy on the eyes in both themes (the old solid var(--tc) was glaring). */
.chip[aria-pressed='true'] {
  background: color-mix(in srgb, var(--tc) 24%, transparent);
  border-color: var(--tc);
  color: color-mix(in srgb, var(--tc) 78%, var(--text));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tc) 50%, transparent);
}
.chip[aria-pressed='true'] .ct {
  color: color-mix(in srgb, var(--tc) 55%, var(--text));
}
.chip.def[aria-pressed='true'] {
  background: color-mix(in srgb, var(--text-dim) 20%, transparent);
  border-color: var(--text-dim);
  color: var(--text);
}
/* Quick Access shelf */
.tagbar.quick {
  padding-bottom: 10px;
  border-top: 1px solid var(--border);
}
.chip.pinned {
  cursor: grab;
  padding-right: 5px;
}
.chip.pinned:active {
  cursor: grabbing;
}
.unpin {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
}
.unpin:hover {
  opacity: 1;
}
.quick-empty {
  font-size: 11px;
  color: var(--text-hint);
  line-height: 1.4;
}
/* manage popover */
.manage-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}
.manage {
  position: absolute;
  left: 12px;
  bottom: 12px;
  width: 236px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.manage-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-dim);
}
.close-x {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.rename {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 12.5px;
}
.rename:focus {
  outline: none;
  border-color: var(--accent);
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}
.swatch[aria-pressed='true'] {
  border-color: var(--text);
}
.manage-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.spacer {
  flex: 1;
}
.mbtn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 5px 10px;
  font-size: 11.5px;
  cursor: pointer;
}
.mbtn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}
.mbtn.danger:hover {
  border-color: #f85149;
  color: #f85149;
}
</style>
