// Adapter registry. Every adapter turns a raw file into comparable content:
//   { kind: 'text', text: string, language: string }
// Future adapters (docx, pdf, image) plug in here without touching the viewer.
import { textAdapter } from './textAdapter'

const adapters = [textAdapter]

export function resolveAdapter(file) {
  return adapters.find((a) => a.matches(file)) ?? textAdapter
}
