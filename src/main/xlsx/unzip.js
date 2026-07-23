import { unzipSync } from 'fflate'
import { XlsxError } from './errors'

// Only the parts a value diff interprets are ever inflated. Everything else —
// formulas' external links (xl/externalLinks/*), VBA (xl/vbaProject.bin),
// drawings, media, styles, connections — is left compressed and untouched, so
// the code that would parse it is never a reachable attack surface.
const ALLOWED =
  /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/

export function isAllowedEntry(name) {
  return ALLOWED.test(name)
}

export const UNZIP_DEFAULTS = {
  // Compressed-input ceiling. files.js overrides this with the spreadsheet
  // size cap so the reader agrees with the Settings slider; this default is the
  // same value for direct/test callers.
  maxInputBytes: 100 * 1024 * 1024, // whole .xlsx (compressed)
  maxEntryBytes: 256 * 1024 * 1024, // one inflated part
  maxTotalBytes: 512 * 1024 * 1024, // all inflated parts together
  maxRatio: 500 // inflated / compressed, per entry
}

// Inflate ONLY the allowlisted entries, refusing decompression bombs. The zip
// header's sizes are attacker-controlled, so they gate inflation cheaply in the
// filter; the ACTUAL inflated lengths are re-checked afterwards in case a header
// lied. NOTE (follow-up): the synchronous unzip still fully inflates an accepted
// entry before the post-check sees it — a production build should switch to
// fflate's streaming `Unzip` with a hard byte-abort so the bound is enforced
// during inflation, not after.
export function extractXlsxEntries(buffer, opts = {}) {
  const cfg = { ...UNZIP_DEFAULTS, ...opts }
  const input = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (input.length > cfg.maxInputBytes) {
    throw new XlsxError('bomb', 'file exceeds the maximum .xlsx size')
  }

  let headerTotal = 0
  let capError = null
  const filter = (file) => {
    if (capError || !isAllowedEntry(file.name)) return false
    if (file.originalSize > cfg.maxEntryBytes) {
      capError = 'an entry is too large to inflate'
    } else if (file.size > 0 && file.originalSize / file.size > cfg.maxRatio) {
      capError = 'an entry has a suspicious compression ratio'
    } else {
      headerTotal += file.originalSize
      if (headerTotal > cfg.maxTotalBytes) capError = 'the archive inflates to too much data'
    }
    return !capError
  }

  let unzipped
  try {
    unzipped = unzipSync(input, { filter })
  } catch {
    throw new XlsxError('unzip', 'not a readable .xlsx archive')
  }
  if (capError) throw new XlsxError('bomb', capError)
  return checkInflated(unzipped, cfg)
}

function checkInflated(unzipped, cfg) {
  const entries = new Map()
  let total = 0
  for (const name of Object.keys(unzipped)) {
    const bytes = unzipped[name]
    if (bytes.length > cfg.maxEntryBytes) {
      throw new XlsxError('bomb', 'an inflated entry is too large')
    }
    total += bytes.length
    if (total > cfg.maxTotalBytes) {
      throw new XlsxError('bomb', 'the archive inflates to too much data')
    }
    entries.set(name, bytes)
  }
  return entries
}
