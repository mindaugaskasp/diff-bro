export function countdownText(expiresAt, now) {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export const daysLeft = (expiresAt, now) => Math.max(1, Math.ceil((expiresAt - now) / 86_400_000))

export function relativeAge(at, now, t) {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000)
  if (minutes < 1) return t('lan.time.justNow')
  if (minutes < 60) return t('lan.time.minutes', { n: minutes })
  const hours = Math.floor(minutes / 60)
  return hours < 24
    ? t('lan.time.hours', { n: hours })
    : t('lan.time.days', { n: Math.floor(hours / 24) })
}

export const clockTime = (at) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
