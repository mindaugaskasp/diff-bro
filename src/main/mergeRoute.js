// A `git mergetool` launch, from argv to the message the renderer gets, plus
// the handlers that answer it. Split out of cliRoute.js: this is the one place
// the app writes files it did not create, and it earns its own module.
import { ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import {
  clearOpenRel,
  conflictRows,
  endConflictSession,
  indexOfRel,
  isResolvedRel,
  locate,
  noteResolved,
  openConflictAt,
  openConflictSession,
  openRel,
  takeSideAt,
  writeConflictText
} from './conflictSession'
import {
  beginMerge,
  cancelMerge,
  endMerge,
  mergeInProgress,
  releaseLauncher,
  writeMerged
} from './mergeSession'
import { mergeInputsFor } from './mergeInputs'
import { hasConflictMarkers, isBinaryBuffer } from './mergeGuards'
import { t } from './i18n'

const refuse = (key) => void process.stderr.write(`${t(key)}\n`)

function readMerged(path) {
  let buffer
  try {
    buffer = readFileSync(path)
  } catch {
    return refuse('cliErrors.merge-unreadable')
  }
  // git calls the mergetool for a BINARY conflict too, and leaves it with no
  // markers. Decoding one as text turns every invalid byte into U+FFFD, and
  // writing that back destroys the file.
  if (isBinaryBuffer(buffer)) return refuse('cliErrors.merge-binary')
  return buffer.toString('utf8')
}

/**
 * The list this launch belongs to, and whether the launch is for a file the
 * reader already answered out of order.
 *
 * Answered here means answered by the READER, out of git's order. Such a file no
 * longer has markers in it, so this has to run BEFORE the marker guard: refused
 * there it would write no sentinel, and the terminal running `git mergetool`
 * would wait out the launcher's two hours on a decision already made.
 */
async function walkFor(merged) {
  const found = await locate(merged)
  launchRel = found?.rel ?? null
  // No repository behind this launch — a mergetool run by hand, a file outside
  // any repo. The PREVIOUS walk's list, and the row it had open, must not
  // survive into it: left standing, this launch's Save wrote that repository's
  // file with text the reader typed for this one.
  if (!found) {
    endConflictSession()
    return { rows: [], at: -1 }
  }
  await openConflictSession(found.root)
  if (isResolvedRel(found.rel)) return { done: true }
  return { rows: conflictRows(), at: indexOfRel(found.rel) }
}

// Where the file this launch was given sits in the repository, so its own write
// can be recorded in the list the same way an out-of-order one is.
let launchRel = null

/**
 * The list decides the position, overriding mergeSession's launch counter.
 * That counter tallies how many launches this PROCESS has seen, which is a
 * position only while one walk is the only thing that ever happened — a second
 * `git mergetool` run had it reading `6 of 6` for a four-file conflict.
 */
const walkOf = (walk) =>
  walk.rows.length
    ? { conflicts: walk.rows, at: walk.at, position: walk.at + 1, total: walk.rows.length }
    : { conflicts: walk.rows, at: walk.at }

/**
 * @param {object} command  the parsed `mergetool` verb
 * @param {(payload: object) => void} deliver
 */
export function routeMerge(command, deliver) {
  const content = readMerged(command.merged)
  if (typeof content !== 'string') return
  // A NAME for the band, never a path: the renderer must not be able to learn,
  // or name, the file main is going to write.
  const base = { name: 'merge', fileName: basename(command.merged), content }
  const show = (extra) => {
    // Nothing to decide is not the same as "resolved": a file with no markers is
    // one this tool has no business rewriting.
    if (!hasConflictMarkers(content)) return refuse('cliErrors.merge-no-conflicts')
    beginMerge(command)
    return mergeInputsFor(command.merged).then((inputs) =>
      deliver({ ...base, ...inputs, ...extra })
    )
  }
  walkFor(command.merged)
    .then((walk) => (walk.done ? releaseLauncher(command.merged, 'written') : show(walkOf(walk))))
    // Without this the renderer is never told, no sentinel is written, and the
    // terminal that ran `git mergetool` waits forever on a decision nobody was
    // asked for. The markers alone are enough to resolve it.
    .catch(() => show({}))
}

function releaseCurrentLaunch() {
  const pending = mergeInProgress()
  if (!pending) return
  endMerge()
  releaseLauncher(pending.merged, 'written')
}

// Save targets the row the view has open. A row opened OUT OF ORDER is written
// and marked, and git's later launch for it short-circuits in walkFor.
//
// The launch's own file goes through the launch's fence instead, even when the
// list is what opened it: `writeConflictText` writes the same bytes to the same
// path but cannot release the launcher, so routing on `openRel` alone left the
// terminal waiting out its full two hours on a file already resolved. The list
// pre-selects that row, so this is the primary button's path.
function saveMerge(text) {
  const open = openRel()
  if (open && open !== launchRel) return writeConflictText(text)
  clearOpenRel()
  const res = writeMerged(text)
  if (res.ok) noteResolved(launchRel)
  return res
}

export function registerMergeIpc() {
  ipcMain.handle('merge:write', (e, text) => saveMerge(text))
  // Declining is an answer too: it releases the launcher and spends the session.
  // Backing out of a row opened OUT OF ORDER is not that — it declines nothing,
  // because git is still waiting on a different file. Cancelling there used to
  // write `cancelled` for the launch's file, telling git a file the reader had
  // not even looked at was refused.
  ipcMain.handle('merge:cancel', () => {
    const open = openRel()
    clearOpenRel()
    if (open && open !== launchRel) return { ok: true }
    endConflictSession()
    return cancelMerge()
  })
  ipcMain.handle('merge:list', () => conflictRows())
  ipcMain.handle('merge:take', async (e, index, side) => {
    const res = await takeSideAt({ index, side: side === 'theirs' ? 'theirs' : 'ours' })
    // Answering the row for the file THIS launch was given writes it directly,
    // which leaves the launch's own session armed and the terminal waiting on a
    // sentinel that would never come. Spend it here.
    const wasCurrent = res.ok && res.rel === launchRel
    if (wasCurrent) releaseCurrentLaunch()
    return { ok: res.ok, error: res.error, wasCurrent }
  })
  ipcMain.handle('merge:open', (e, index) => openConflictAt(index))
  ipcMain.handle('merge:endWalk', () => void endConflictSession())
}
