// Direction overrides and zero-width characters can make one name read as another.
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu

export const cleanPeerName = (name, maxChars) =>
  [...String(name).replace(INVISIBLE, '')].slice(0, maxChars).join('').trim()
