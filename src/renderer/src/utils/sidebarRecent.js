const DAY_MS = 86_400_000

function startOfDay(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function bucketOf(time, today) {
  if (time >= today) return 'today'
  if (time >= today - DAY_MS) return 'yesterday'
  if (time >= today - 6 * DAY_MS) return 'thisWeek'
  return 'earlier'
}

const BUCKETS = ['today', 'yesterday', 'thisWeek', 'earlier']
const BUCKET_LABEL_KEY = {
  today: 'homePanel.day.today',
  yesterday: 'homePanel.day.yesterday',
  thisWeek: 'homePanel.day.thisWeek',
  earlier: 'homePanel.day.earlier'
}

/**
 * Diffs and snippets merged by their last change, newest first, grouped by
 * local day. Callers pass only live entries (expired diffs already dropped).
 * @param {{ diffs: object[], snippets: object[], now: number, limit?: number }} args
 * @returns {{ key: string, labelKey: string, items: { kind: string, id: string, name: string, at: number, entry: object }[] }[]}
 */
export function sidebarRecent({ diffs, snippets, now, limit = 8 }) {
  const items = [
    ...diffs.map((entry) => ({ kind: entry.from ? 'received' : 'diff', entry })),
    ...snippets.map((entry) => ({ kind: 'snippet', entry }))
  ]
    .map(({ kind, entry }) => ({
      kind,
      id: entry.id,
      name: entry.name,
      at: entry.updatedAt ?? entry.createdAt,
      entry
    }))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
  const today = startOfDay(now)
  return BUCKETS.map((key) => ({
    key,
    labelKey: BUCKET_LABEL_KEY[key],
    items: items.filter((item) => bucketOf(item.at, today) === key)
  })).filter((group) => group.items.length)
}
