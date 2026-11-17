// Literal keys, so check:i18n can see the call sites.
export const SILENCE_CHOICES = [
  { value: 1, labelKey: 'lan.silence.choice.1' },
  { value: 5, labelKey: 'lan.silence.choice.5' },
  { value: 10, labelKey: 'lan.silence.choice.10' },
  { value: 30, labelKey: 'lan.silence.choice.30' },
  { value: 60, labelKey: 'lan.silence.choice.60' },
  { value: 1440, labelKey: 'lan.silence.choice.1440' },
  { value: 'forever', labelKey: 'lan.silence.choice.forever' }
]

export const silenceLabelKey = (value) =>
  SILENCE_CHOICES.find((c) => c.value === value)?.labelKey ?? 'lan.silence.choice.60'
