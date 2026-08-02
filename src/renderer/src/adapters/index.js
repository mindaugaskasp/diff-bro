// Adapter registry. Every adapter turns a raw file into comparable content:
//   text:        { kind: 'text', text: string, language: string }
//   spreadsheet: { kind: 'spreadsheet', sheets: SheetGrid[] }
//   streamed:    { kind: 'streamed', path: string }  — too large to hold
// and answers sameContent(a, b): what "unchanged on disk" means for the format.
// Order matters: the first matching adapter wins, and textAdapter matches
// everything, so it stays last. Future adapters (docx, …) plug in ahead of it.
import { xlsxAdapter } from './xlsxAdapter'
import { streamedAdapter } from './streamedAdapter'
import { textAdapter } from './textAdapter'

const adapters = [xlsxAdapter, streamedAdapter, textAdapter]

export function resolveAdapter(file) {
  return adapters.find((a) => a.matches(file)) ?? textAdapter
}
