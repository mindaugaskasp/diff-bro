import { describe, expect, it } from 'vitest'
import { matchesTags, toggleTag } from '../../../src/renderer/src/utils/tagFilter'

describe('matchesTags', () => {
  // #121: a tag is a path, and scoping to a section takes in what is nested under it.
  it('matches a row tagged anywhere under the scoped path', () => {
    expect(matchesTags(['ops/k8s/prod'], ['ops'])).toBe(true)
    expect(matchesTags(['ops/k8s/prod'], ['ops/k8s'])).toBe(true)
    expect(matchesTags(['ops/k8s'], ['ops/k8s/prod'])).toBe(false)
    expect(matchesTags(['opsx'], ['ops'])).toBe(false)
  })

  it('lets everything through when nothing is selected', () => {
    expect(matchesTags(['a'], [])).toBe(true)
    expect(matchesTags([], undefined)).toBe(true)
  })

  it('keeps a row carrying ANY selected tag', () => {
    expect(matchesTags(['json', 'work'], ['json'])).toBe(true)
    expect(matchesTags(['json', 'work'], ['json', 'work'])).toBe(true)
    // Picking a second tag widens the list. Requiring both would hide a row
    // tagged only json, which is the opposite of what picking json asked for.
    expect(matchesTags(['json'], ['json', 'work'])).toBe(true)
    expect(matchesTags(['other'], ['json', 'work'])).toBe(false)
  })

  it('excludes a row with no tags once any tag is selected', () => {
    expect(matchesTags([], ['json'])).toBe(false)
    expect(matchesTags(undefined, ['json'])).toBe(false)
  })
})

describe('toggleTag', () => {
  it('adds a tag that is not selected and removes one that is', () => {
    expect(toggleTag([], 'json')).toEqual(['json'])
    expect(toggleTag(['json'], 'work')).toEqual(['json', 'work'])
    expect(toggleTag(['json', 'work'], 'json')).toEqual(['work'])
  })

  it('returns a new array rather than mutating the one given', () => {
    const before = ['json']
    expect(toggleTag(before, 'work')).not.toBe(before)
    expect(before).toEqual(['json'])
  })

  it('copes with no selection yet', () => {
    expect(toggleTag(undefined, 'json')).toEqual(['json'])
  })
})
