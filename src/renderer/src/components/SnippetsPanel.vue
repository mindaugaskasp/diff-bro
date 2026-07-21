<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSnippetStore, TAG_PALETTE } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import TagGlyph from './TagGlyph.vue'

const store = useSnippetStore()
const diff = useDiffStore()

const query = ref('')
const activeTags = ref(new Set()) // tag names, plus the DEFAULT marker for untagged
const DEFAULT = '__DEFAULT__' // sentinel for the untagged filter (never a real, lowercased tag)

// Collapse state: the whole section, the tag filter bar, and each shelf.
const sectionOpen = ref(true)
const tagsOpen = ref(true)
const favOpen = ref(true)
const allOpen = ref(true)

// Tags and text search COMPOSE (AND): neither resets the other.
const filtering = computed(() => activeTags.value.size > 0 || query.value.trim().length > 0)

function toggleTag(name) {
  const next = new Set(activeTags.value)
  next.has(name) ? next.delete(name) : next.add(name)
  activeTags.value = next
  if (name !== DEFAULT && next.has(name)) store.touchTag(name) // used → recent
}
function clearFilters() {
  activeTags.value = new Set()
  query.value = ''
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

// Tag filter bar: Default catch-all first, then tags newest/just-used first.
const tagChips = computed(() => [
  { name: DEFAULT, label: 'Default', color: null, count: store.defaultCount },
  ...store.tagList.map((t) => ({ name: t.name, label: t.name, color: t.color, count: t.count }))
])

// Compact "3d / 2w / 5h" age from a creation timestamp. Not live — snippets
// don't expire, so a coarse label recomputed on render is enough.
function ago(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(d / 365)}y`
}

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
// Decrypt a Mermaid snippet and open it in the resizable diagram viewer.
async function viewDiagram(entry) {
  const code = await store.load(entry.id)
  if (code != null) diff.openMermaid(entry.name, code)
}

// --- hover preview: decrypt on demand, debounced, briefly cached ---
// Snippets are encrypted at rest, so a preview costs a vault:decrypt. The 350 ms
// delay means we only decrypt the row the pointer settles on, not every row it
// sweeps past. Contents render through text interpolation only — never v-html.
const preview = ref(null) // { id, name, tags, lang, text, style }
const cache = new Map()
let hoverTimer = null
let pendingId = null

async function onRowEnter(entry, e) {
  clearTimeout(hoverTimer)
  const row = e.currentTarget
  hoverTimer = setTimeout(async () => {
    pendingId = entry.id
    let text = cache.get(entry.id)
    if (text === undefined) {
      text = await store.load(entry.id)
      if (text == null) return // key unavailable / dropped — no preview
      cache.set(entry.id, text)
    }
    if (pendingId !== entry.id) return // pointer already moved on
    preview.value = {
      id: entry.id,
      name: entry.name,
      tags: entry.tags,
      lang: entry.language && entry.language !== 'auto' ? entry.language : '',
      text: text.slice(0, 4000),
      style: previewStyle(row)
    }
  }, 350)
}
function onRowLeave() {
  clearTimeout(hoverTimer)
  pendingId = null
  preview.value = null
}
// Place the popover just outside the sidebar, clamped to the viewport.
function previewStyle(row) {
  const r = row.getBoundingClientRect()
  const w = 320
  const gap = 8
  let left = r.right + gap
  if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - gap)
  const top = Math.min(r.top, window.innerHeight - 230)
  return { left: `${left}px`, top: `${Math.max(8, top)}px` }
}
// The editor is the ONLY path that mutates snippet content, so dropping the
// cache when it closes is sufficient invalidation. If a future feature can
// change a snippet's content without opening the editor, it must clear `cache`
// too, or previews will go stale.
watch(
  () => store.editingSnippet,
  (v) => {
    if (!v) cache.clear()
  }
)
onBeforeUnmount(() => clearTimeout(hoverTimer))

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
    <div class="head sub section-head" @click="sectionOpen = !sectionOpen">
      <span class="chev" :class="{ open: sectionOpen }">▸</span>
      <span class="section-title">Snippets</span>
      <button
        class="hbtn"
        title="Export all snippets to a passphrase-protected file"
        @click.stop="store.pendingExport = { all: true }"
      >
        ↑
      </button>
      <button class="hbtn" title="Import snippets from a file" @click.stop="store.pendingImport = true">
        ↓
      </button>
    </div>

    <div v-show="sectionOpen" class="section-body">
      <div class="head-actions">
        <button class="action primary" title="Create a new snippet" @click="newSnippet">
          + New snippet
        </button>
      </div>

      <div v-if="store.entries.length" class="filter" :class="{ 'has-text': query.trim() }">
        <input v-model="query" type="search" placeholder="Filter by name or tag…" spellcheck="false" />
        <button v-if="query.trim()" class="xbox" title="Clear search" @click="query = ''">×</button>
      </div>

      <p v-if="!store.entries.length" class="empty">
        Press <strong>New snippet</strong> to create one — saved encrypted, tagged however you like,
        and exportable as a passphrase-protected file.
      </p>

      <!-- collapsible tag filter bar (tags compose with search; inactive dim) -->
      <div v-if="store.entries.length" class="tagbar" :class="{ collapsed: !tagsOpen, 'has-active': activeTags.size }">
        <div class="tagbar-head">
          <button class="tagbar-toggle" @click="tagsOpen = !tagsOpen">
            <span class="chev" :class="{ open: tagsOpen }">▸</span>
            <span>Tags</span>
            <span v-if="activeTags.size" class="active-count">· {{ activeTags.size }} active</span>
          </button>
          <button v-if="filtering" class="clear" @click="clearFilters">Clear all</button>
        </div>
        <div v-show="tagsOpen" class="chips">
          <button
            v-for="t in tagChips"
            :key="t.name"
            class="chip"
            :class="{ def: t.name === DEFAULT, on: activeTags.has(t.name) }"
            :style="t.color ? { '--tc': t.color } : {}"
            :aria-pressed="activeTags.has(t.name)"
            :title="
              t.name === DEFAULT
                ? 'Untagged snippets'
                : `Filter by ${t.label} · right-click to manage`
            "
            @click="toggleTag(t.name)"
            @contextmenu="openManage($event, t.name)"
          >
            <TagGlyph :color="t.color || 'var(--text-dim)'" />
            {{ t.label }}<span class="ct">{{ t.count }}</span>
          </button>
        </div>
      </div>

      <!-- ★ Favorites shelf -->
      <div v-if="visibleFavorites.length" class="shelf fav" :class="{ collapsed: !favOpen }">
        <button class="shelf-head" @click="favOpen = !favOpen">
          <span class="chev" :class="{ open: favOpen }">▸</span>
          <span class="shelf-title">★ Favorites</span>
          <span class="shelf-count">{{ visibleFavorites.length }}</span>
        </button>
        <ul v-show="favOpen" class="rows">
          <li
            v-for="entry in visibleFavorites"
            :key="entry.id"
            class="row"
            @mouseenter="onRowEnter(entry, $event)"
            @mouseleave="onRowLeave"
          >
            <button class="star on" title="Unfavorite" @click="store.toggleFavorite(entry.id)">★</button>
            <button class="entry" @click="editSnippet(entry.id)">
              <span class="nm">{{ entry.name }}</span>
              <span class="dots">
                <span
                  v-for="t in entry.tags"
                  :key="t"
                  class="dot"
                  :style="{ background: store.colorOf(t) }"
                ></span>
                <span v-if="!entry.tags.length" class="dot faint"></span>
              </span>
            </button>
            <span class="when">{{ ago(entry.createdAt) }}</span>
            <span class="rowacts">
              <button
                v-if="entry.language === 'mermaid'"
                class="row-btn"
                title="View diagram"
                @click="viewDiagram(entry)"
              >
                ◈
              </button>
              <button class="row-btn" title="Copy to clipboard" @click="copySnippet(entry.id)">⧉</button>
              <button
                class="row-btn delete"
                title="Delete"
                @click="store.requestDelete('snippet', entry.id, entry.name)"
              >
                ×
              </button>
            </span>
          </li>
        </ul>
      </div>

      <!-- All snippets shelf (newest first) -->
      <div v-if="store.entries.length" class="shelf" :class="{ collapsed: !allOpen }">
        <button class="shelf-head" @click="allOpen = !allOpen">
          <span class="chev" :class="{ open: allOpen }">▸</span>
          <span class="shelf-title">All snippets <span class="sort-note">· newest first</span></span>
          <span class="shelf-count">{{ visibleListed.length }}</span>
        </button>
        <ul v-show="allOpen" class="rows">
          <li v-if="!anyVisible" class="empty small">No snippets match — try removing a filter.</li>
          <li
            v-for="entry in visibleListed"
            :key="entry.id"
            class="row"
            @mouseenter="onRowEnter(entry, $event)"
            @mouseleave="onRowLeave"
          >
            <button class="star" title="Favorite (pin to top)" @click="store.toggleFavorite(entry.id)">
              ☆
            </button>
            <button class="entry" @click="editSnippet(entry.id)">
              <span class="nm">{{ entry.name }}</span>
              <span class="dots">
                <span
                  v-for="t in entry.tags"
                  :key="t"
                  class="dot"
                  :style="{ background: store.colorOf(t) }"
                ></span>
                <span v-if="!entry.tags.length" class="dot faint"></span>
              </span>
            </button>
            <span class="when">{{ ago(entry.createdAt) }}</span>
            <span class="rowacts">
              <button
                v-if="entry.language === 'mermaid'"
                class="row-btn"
                title="View diagram"
                @click="viewDiagram(entry)"
              >
                ◈
              </button>
              <button class="row-btn" title="Copy to clipboard" @click="copySnippet(entry.id)">⧉</button>
              <button
                class="row-btn delete"
                title="Delete"
                @click="store.requestDelete('snippet', entry.id, entry.name)"
              >
                ×
              </button>
            </span>
          </li>
        </ul>
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

  <!-- hover preview popover (fixed, escapes the scroll container) -->
  <div v-if="preview" class="preview" :style="preview.style">
    <div class="pv-head">
      <span class="pv-name">{{ preview.name }}</span>
      <span v-if="preview.lang" class="pv-lang">{{ preview.lang }}</span>
    </div>
    <pre class="pv-body">{{ preview.text }}</pre>
    <div class="pv-foot">
      <span class="pv-tags">
        <span v-for="t in preview.tags" :key="t" class="pv-tag">
          <span class="dot" :style="{ background: store.colorOf(t) }"></span>{{ t }}
        </span>
        <span v-if="!preview.tags.length" class="pv-untagged">Default</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.snippets-section {
  display: flex;
  flex-direction: column;
}
/* Section header band — matches SavedDiffs.vue, now a collapse toggle. */
.head {
  display: flex;
  align-items: center;
  gap: 8px;
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
.section-head {
  cursor: pointer;
  user-select: none;
}
.section-title {
  flex: 1;
}
.chev {
  display: inline-block;
  font-size: 9px;
  color: var(--text-dim);
  transition: transform 0.12s;
}
.chev.open {
  transform: rotate(90deg);
}
.hbtn {
  background: none;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  width: 20px;
  height: 20px;
  padding: 0;
}
.hbtn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
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
}
.filter {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 10px 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0 6px 0 8px;
}
.filter input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  color: var(--text);
  padding: 5px 0;
  font-size: 12.5px;
}
.filter input:focus {
  outline: none;
}
.filter:focus-within {
  border-color: var(--accent);
}
.xbox {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0 2px;
}
.xbox:hover {
  color: var(--text);
}
.empty {
  padding: 4px 10px 10px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}
.empty.small {
  padding: 8px 10px;
  font-size: 11.5px;
  list-style: none;
}
/* tag filter bar */
.tagbar {
  margin: 0 10px 4px;
}
.tagbar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.tagbar-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 0;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-hint);
}
.tagbar-toggle .chev {
  font-size: 8px;
}
.active-count {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--accent);
  font-size: 10px;
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
  gap: 5px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tc) 45%, transparent);
  background: color-mix(in srgb, var(--tc) 12%, transparent);
  color: color-mix(in srgb, var(--tc) 72%, var(--text));
  font-family: inherit;
  transition:
    opacity 0.12s,
    filter 0.12s;
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
.chip.on {
  background: color-mix(in srgb, var(--tc) 24%, transparent);
  border-color: var(--tc);
  color: color-mix(in srgb, var(--tc) 78%, var(--text));
  box-shadow: inset 0 0 0 1px var(--tc);
}
.chip.def.on {
  background: color-mix(in srgb, var(--text-dim) 20%, transparent);
  border-color: var(--text-dim);
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--text-dim);
}
/* Soften every non-selected chip while a filter is active, so the active pops. */
.tagbar.has-active .chip:not(.on) {
  opacity: 0.34;
  filter: saturate(0.45);
}
.tagbar.has-active .chip:not(.on):hover {
  opacity: 0.9;
  filter: none;
}
/* shelves */
.shelf {
  margin-top: 4px;
}
.shelf-head {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 10px 4px;
  font-family: inherit;
}
.shelf-head .chev {
  font-size: 8px;
}
.shelf-title {
  flex: 1;
  text-align: left;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-hint);
}
.shelf.fav .shelf-title {
  color: #d29922;
}
.sort-note {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-dim);
  font-size: 9.5px;
}
.shelf-count {
  font-size: 10px;
  color: var(--text-hint);
  font-weight: 600;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 6px;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.row {
  display: flex;
  align-items: center;
}
.shelf.fav .row {
  background: color-mix(in srgb, #d29922 9%, transparent);
  box-shadow: inset 3px 0 0 #d29922;
}
.shelf.fav .row:hover {
  background: color-mix(in srgb, #d29922 15%, transparent);
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
  font-size: 14px;
  line-height: 1;
  padding: 0 4px 0 8px;
}
.star:hover {
  color: #d29922;
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
.row:hover .entry {
  color: var(--text);
}
.nm {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dots {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
}
.dot.faint {
  opacity: 0.4;
}
.when {
  font-size: 10.5px;
  color: var(--text-hint);
  font-variant-numeric: tabular-nums;
  padding: 0 8px;
  flex-shrink: 0;
}
/* Swap the age for copy/delete on hover, so the resting row stays quiet. */
.rowacts {
  display: none;
  align-items: center;
  flex-shrink: 0;
}
.row:hover .when {
  display: none;
}
.row:hover .rowacts {
  display: flex;
}
.row-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 14px;
  padding: 0 6px;
}
.row-btn:hover {
  color: var(--accent);
}
.row-btn.delete:hover {
  color: #f85149;
}
/* hover preview popover */
.preview {
  position: fixed;
  z-index: 30;
  width: 320px;
  max-width: 44vw;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 9px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  pointer-events: none;
}
.pv-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.pv-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-lang {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
}
.pv-body {
  margin: 0;
  padding: 9px 11px;
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text);
  white-space: pre;
  overflow: hidden;
  max-height: 168px;
}
.pv-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 11px;
  border-top: 1px solid var(--border);
}
.pv-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pv-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-hint);
}
.pv-tag .dot {
  width: 7px;
  height: 7px;
}
.pv-untagged {
  font-size: 10.5px;
  color: var(--text-dim);
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
