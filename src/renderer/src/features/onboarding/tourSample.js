import { useDiffStore } from '../../stores/diffStore'
import { useTabsStore } from '../../stores/tabsStore'

const holdsWork = (diff) => !!(diff.left || diff.right || diff.mode === 'paste')

/**
 * Loads the sample pair into the blank start tab, or a fresh one, and marks
 * that tab so it is never restored and never asks before closing.
 * @returns {Promise<{ tabId: string, files: { name: string, content: string }[] }|null>}
 */
export async function openSample() {
  const files = (await window.api.demoFiles()) ?? []
  if (files.length !== 2) return null
  const tabs = useTabsStore()
  const diff = useDiffStore()
  if (holdsWork(diff) && !tabs.newTab()) return null
  const tab = tabs.active
  if (!tab) return null
  tab.sample = true
  await diff.dropFiles(files.map(({ name, content }) => ({ name, path: null, content })))
  diff.dismissFormatHints(['left', 'right'])
  return { tabId: tab.id, files: files.map(({ name, content }) => ({ name, content })) }
}

/** @param {{ name: string, content: string }[]} files */
export const isSampleOnScreen = (diff, files) =>
  [diff.left, diff.right].every((side, i) => !side || side.content === files[i].content)

export const SAMPLE_NAMES = ['config-v1.json', 'config-v2.json']
