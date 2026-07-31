<script setup>
// One tooltip for the whole window; icon buttons opt in with data-tip. Native
// `title` is drawn by the OS — the app cannot see, style or time it, and in a
// frameless Electron window it often never appears at all.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const DELAY_MS = 300
const text = ref('')
const style = ref(null)
let timer = null

function show(el) {
  const tip = el.getAttribute('data-tip')
  if (!tip) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    const r = el.getBoundingClientRect()
    text.value = tip
    style.value = {
      left: `${Math.round(r.left + r.width / 2)}px`,
      top: `${Math.round(r.bottom + 6)}px`
    }
  }, DELAY_MS)
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
  ['keydown', hide]
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
    <div v-if="text" class="tip-bubble" :style="style" role="tooltip">{{ text }}</div>
  </Teleport>
</template>

<style scoped src="./styles/AppTooltip.css"></style>
