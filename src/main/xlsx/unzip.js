import { unzipSync } from 'fflate'
import { XlsxError } from './errors'

// Only the parts a value diff reads are inflated; everything else (external
// links, VBA, media, styles) stays compressed, so its parser is never a
// reachable attack surface.
const ALLOWED =
  /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/

export function isAllowedEntry(name) {
  return ALLOWED.test(name)
}

export const UNZIP_DEFAULTS = {
  // files.js overrides this with the spreadsheet size cap; default for tests.
  maxInputBytes: 100 * 1024 * 1024, // whole .xlsx (compressed)
  maxEntryBytes: 256 * 1024 * 1024, // one inflated part
  maxTotalBytes: 512 * 1024 * 1024, // all inflated parts together
  maxRatio: 500 // inflated / compressed, per entry
}

// Inflate ONLY allowlisted entries, refusing decompression bombs: attacker-
// controlled header sizes gate cheaply in the filter, then actual inflated
// lengths are re-checked. NOTE: unzipSync fully inflates an accepted entry
// before the post-check — a follow-up should switch to fflate streaming with a
// hard byte-abort so the bound holds during inflation.
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
