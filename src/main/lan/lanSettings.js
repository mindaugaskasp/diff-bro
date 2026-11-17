export const SILENCE_CHOICES = [1, 5, 10, 30, 60, 1440, 'forever']
export const NAME_MAX = 64
const FALLBACK_NAME = 'Diff Bro'

export function cleanComputerName(raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  const short = /\s/.test(text) ? text : text.split('.')[0]
  return [...short].slice(0, NAME_MAX).join('') || FALLBACK_NAME
}

export const defaultLanSettings = (computerName) => ({
  enabled: true,
  visible: true,
  popups: true,
  silencedUntil: 0,
  name: cleanComputerName(computerName)
})

const pickBool = (v, fallback) => (typeof v === 'boolean' ? v : fallback)

function pickName(v, fallback) {
  const name = typeof v === 'string' ? [...v.trim()].slice(0, NAME_MAX).join('') : ''
  return name || fallback
}

export function normalizeLanSettings(saved, computerName) {
  const base = defaultLanSettings(computerName)
  const s = saved && typeof saved === 'object' ? saved : {}
  return {
    enabled: pickBool(s.enabled, base.enabled),
    visible: pickBool(s.visible, base.visible),
    popups: pickBool(s.popups, base.popups),
    silencedUntil:
      Number.isSafeInteger(s.silencedUntil) && s.silencedUntil > 0 ? s.silencedUntil : 0,
    name: pickName(s.name, base.name)
  }
}

export function silence(settings, choice, now) {
  if (!SILENCE_CHOICES.includes(choice)) return settings
  if (choice === 'forever') return { ...settings, popups: false, silencedUntil: 0 }
  return { ...settings, silencedUntil: now + choice * 60_000 }
}

export const setPopups = (settings, on) => ({
  ...settings,
  popups: on,
  silencedUntil: on ? 0 : settings.silencedUntil
})

export const arePopupsShown = (settings, now) => settings.popups && settings.silencedUntil <= now
