import { STOP_AFTER_MINUTES } from '../../../../shared/snippetLanguages'

/** @returns {string|null} a path for main to check, or null when there is nothing new */
export function typedPathToUse(draft, status) {
  const path = draft.trim()
  return path && path !== status?.path ? path : null
}

export const shownVersion = (draft, status) =>
  status?.path && draft === status.path ? status.version : null

/** @returns {{ index: number, path: string, version: string, isCurrent: boolean }[]} */
export const foundPrograms = (status) =>
  (status?.candidates ?? []).map((candidate, index) => ({
    index,
    path: candidate.path,
    version: candidate.version,
    isCurrent: candidate.path === status.path
  }))

export const canFindAgain = (status) => status?.enabled === true

export const hasProgramMenu = (status) => foundPrograms(status).length > 0 || canFindAgain(status)

/** @returns {number|null} whole minutes, or null for what main would refuse */
export function stopAfterFrom(text) {
  const digits = String(text).trim()
  if (!/^\d+$/.test(digits)) return null
  const minutes = Number(digits)
  return minutes <= STOP_AFTER_MINUTES.max ? minutes : null
}
