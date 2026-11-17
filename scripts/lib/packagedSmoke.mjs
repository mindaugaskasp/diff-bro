const INVOKE = /ipcRenderer\.invoke\(\s*'([^']+)'/g
const ENTRY = /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\] \[([^\]]+)\]( \[info\])? (.*)$/
const FRAME = /^\s+at (.*)$/

export const preloadChannels = (sources) =>
  [...new Set(sources.flatMap((src) => [...src.matchAll(INVOKE)].map((m) => m[1])))].sort()

export const missingChannels = (expected, handlers) =>
  expected.filter((channel) => !handlers.includes(channel))

// Each failure with the first stack frame under it, which is what points at the cause.
export function loggedErrors(text, since) {
  const out = []
  let current = null
  for (const line of text.split('\n')) {
    const entry = line.match(ENTRY)
    if (entry) {
      const counts = Date.parse(entry[1]) >= since && !entry[3]
      current = counts ? { head: `[${entry[2]}] ${entry[4]}`, frame: null } : null
      if (current) out.push(current)
    } else if (current && !current.frame) {
      current.frame = line.match(FRAME)?.[1] ?? null
    }
  }
  return out.map(({ head, frame }) => (frame ? `${head} (at ${frame})` : head))
}

export function smokeVerdict({ report, expected, logText, since }) {
  if (!report) return ['the renderer never reported ready']
  if (!Array.isArray(report.handlers)) return ['main could not list its IPC handlers']
  return [
    ...missingChannels(expected, report.handlers).map((c) => `no handler registered for '${c}'`),
    ...loggedErrors(logText, since)
  ]
}

const EXECUTABLES = [
  [/^win(-[a-z0-9]+)?-unpacked$/, 'Diff Bro.exe'],
  [/^mac(-[a-z0-9]+)?$/, 'Diff Bro.app/Contents/MacOS/Diff Bro'],
  [/^linux(-[a-z0-9]+)?-unpacked$/, 'diffbro']
]

export function packagedExecutable(distEntries) {
  for (const entry of distEntries) {
    const hit = EXECUTABLES.find(([dir]) => dir.test(entry))
    if (hit) return `${entry}/${hit[1]}`
  }
  return null
}
