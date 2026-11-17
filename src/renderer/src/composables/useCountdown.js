import { computed, onBeforeUnmount, ref } from 'vue'
import { countdownText } from '../utils/countdown'

export function useCountdown(expiresAt, { now = Date.now, intervalMs = 250 } = {}) {
  const tick = ref(now())
  const timer = setInterval(() => (tick.value = now()), intervalMs)
  onBeforeUnmount(() => clearInterval(timer))
  return computed(() => countdownText(expiresAt(), tick.value))
}
