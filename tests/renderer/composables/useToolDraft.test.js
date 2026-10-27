import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { clearToolDrafts, useToolDraft } from '../../../src/renderer/src/composables/useToolDraft'

describe('useToolDraft', () => {
  afterEach(clearToolDrafts)

  it('gives a reopened tool back what was typed', async () => {
    useToolDraft('json.input').value = '{"a":1}'
    await nextTick()
    expect(useToolDraft('json.input').value).toBe('{"a":1}')
  })

  it('keeps each tool to its own key', async () => {
    useToolDraft('json.input').value = 'json'
    await nextTick()
    expect(useToolDraft('base64.input').value).toBe('')
  })
})
