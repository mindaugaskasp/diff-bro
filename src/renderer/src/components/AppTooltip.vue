<script setup>
// One tooltip for the whole window; icon buttons opt in with data-tip. Native
// `title` is drawn by the OS — the app cannot see, style or time it, and in a
// frameless Electron window it often never appears at all.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const DELAY_MS = 300
// Kept clear of the window edge. The OS drew its own tips inside the screen;
// this one is ours to keep there, and a sidebar row's tip (name + data
// directory) is long enough to run off both edges if nothing does.
const MARGIN = 8
const text = ref('')
const style = ref(null)
const bubble = ref(null)
let timer = null

// Placed under the anchor, then nudged back inside the window. The nudge is
// measured rather than assumed: the bubble wraps, so its size is not known
// until it has rendered.
async function place(el, tip) {
  const r = el.getBoundingClientRect()
  text.value = tip
  style.value = {
    left: `${Math.round(r.left + r.width / 2)}px`,
    top: `${Math.round(r.bottom + 6)}px`
  }
  await nextTick()
  const b = bubble.value?.getBoundingClientRect()
  if (!b) return
  let shiftX = 0
  if (b.left < MARGIN) shiftX = MARGIN - b.left
  else if (b.right > window.innerWidth - MARGIN) shiftX = window.innerWidth - MARGIN - b.right
  // No room below (a row near the bottom): sit above the anchor instead.
  const flip = b.bottom > window.innerHeight - MARGIN
  style.value = {
    left: `${Math.round(r.left + r.width / 2 + shiftX)}px`,
    top: `${Math.round(flip ? r.top - b.height - 6 : r.bottom + 6)}px`
  }
}

function show(el) {
  const tip = el.getAttribute('data-tip')
  if (!tip) return
  clearTimeout(timer)
  timer = setTimeout(() => place(el, tip), DELAY_MS)
}

function hide() {
  clearTimeout(timer)
  text.value = ''
}

const anchor = (e) => e.target?.closest?.('[data-tip]')
const onOver = (e) => (anchor(e) ? show(anchor(e)) : hide())
const onOut = (e) => anchor(e) && hide()
const onFocus = (e) => anchor(e) && show(anchor(e))

const LISTENERS = [
  ['mouseover', onOver],
  ['mouseout', onOut],
  ['focusin', onFocus],
  ['focusout', hide],
  ['keydown', hide],
  // Acting on a control ends the tip, the way the OS-drawn one always did.
  ['pointerdown', hide],
  // Its position was measured against a layout that just moved.
  ['wheel', hide]
]
onMounted(() => LISTENERS.forEach(([n, h]) => document.addEventListener(n, h, true)))
onBeforeUnmount(() => {
  clearTimeout(timer)
  LISTENERS.forEach(([n, h]) => document.removeEventListener(n, h, true))
})
</script>

<template>
  <!-- To body: inside the app tree a parent stacking context capped it, so it
       had a box and passed a visibility check while never being painted. -->
  <Teleport to="body">
    <div v-if="text" ref="bubble" class="tip-bubble" :style="style" role="tooltip">{{ text }}</div>
  </Teleport>
</template>

<style scoped src="./styles/AppTooltip.css"></style>
