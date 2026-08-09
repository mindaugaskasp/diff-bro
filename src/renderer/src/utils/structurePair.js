// The structural comparison of two loaded files, or null where there is nothing
// to compare. Lifted out of diffStore so the store holds the question and this
// holds the work. Pure.
import { structureAdapter } from '../adapters/structureAdapter'
import { diffStructures } from './structuralDiff'

/**
 * @param {object} left  a loaded file
 * @param {object} right
 * @param {string|null} kind  the structured format both sides are, if any
 */
export function structurePairDiff(left, right, kind) {
  if (!kind) return null
  const a = structureAdapter.toComparable(left, kind)
  const b = structureAdapter.toComparable(right, kind)
  if (a.error || b.error) return null
  return diffStructures(a.value, b.value)
}
