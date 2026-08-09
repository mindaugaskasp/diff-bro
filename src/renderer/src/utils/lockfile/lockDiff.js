// What changed between two lockfiles, as the dependency moves they describe
// rather than as the thousands of lines they are written in. Pure.

const RANK = { added: 0, removed: 1, bumped: 2, downgraded: 3 }

// Leading `v`, a prerelease tag and build metadata all decorate a version
// without changing which release it is.
function triple(version) {
  const bare = String(version ?? '')
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0]
  const parts = bare.split('.')
  if (parts.length < 2) return null
  const nums = parts.slice(0, 3).map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null
  return { major: nums[0], minor: nums[1], patch: nums[2] ?? 0 }
}

/**
 * The step between two versions, in the direction of travel — a downgrade of a
 * major is still a major move.
 * @returns {'major'|'minor'|'patch'|'same'|'unknown'}
 */
export function semverStep(from, to) {
  const a = triple(from)
  const b = triple(to)
  if (!a || !b) return 'unknown'
  if (a.major === b.major && a.minor === b.minor && a.patch === b.patch) return 'same'
  if (a.major !== b.major) return 'major'
  // Below 1.0.0 the minor IS the breaking position, and a lockfile is full of
  // packages that never left 0.x.
  if (a.minor !== b.minor) return a.major === 0 ? 'major' : 'minor'
  return 'patch'
}

// A name can be installed at more than one version at once, so a side is a set
// of versions per name, not a version per name.
function index(lock) {
  const map = new Map()
  for (const pkg of lock?.packages ?? []) {
    if (!map.has(pkg.name)) map.set(pkg.name, new Map())
    map.get(pkg.name).set(pkg.version, pkg)
  }
  return map
}

// Which way the version moved. Compares the triples, not the strings, so
// `1.10.0` does not read as older than `1.9.0`.
function moveOf(from, to) {
  const a = triple(from.version)
  const b = triple(to.version)
  if (!a || !b) return 'bumped'
  const back =
    b.major < a.major ||
    (b.major === a.major && b.minor < a.minor) ||
    (b.major === a.major && b.minor === a.minor && b.patch < a.patch)
  return back ? 'downgraded' : 'bumped'
}

function statusOf(from, to) {
  if (from && to) return moveOf(from, to)
  return from ? 'removed' : 'added'
}

// A licence only CHANGED where both sides stated one; a lockfile that never
// records licences must not report every package as relicensed.
const licenseMoved = (from, to) =>
  Boolean(from?.license) && Boolean(to?.license) && from.license !== to.license

function rowFor(name, from, to) {
  // The surviving side describes the row: what a package IS after the change,
  // or what it was when it went.
  const now = to ?? from ?? {}
  const both = Boolean(from) && Boolean(to)
  return {
    name,
    status: statusOf(from, to),
    from: from?.version ?? '',
    to: to?.version ?? '',
    step: both ? semverStep(from.version, to.version) : 'unknown',
    direct: now.direct === true,
    dev: now.dev === true,
    license: now.license ?? '',
    licenseChanged: licenseMoved(from, to)
  }
}

// The versions of one name that only one side has. What both sides hold did not
// move, whatever else did.
function moved(leftVersions, rightVersions) {
  const common = new Set([...leftVersions.keys()].filter((v) => rightVersions.has(v)))
  const gone = [...leftVersions.keys()].filter((v) => !common.has(v)).sort()
  const came = [...rightVersions.keys()].filter((v) => !common.has(v)).sort()
  return { gone, came }
}

function rowsForName(name, leftVersions, rightVersions) {
  const { gone, came } = moved(leftVersions ?? new Map(), rightVersions ?? new Map())
  const rows = []
  const pairs = Math.min(gone.length, came.length)
  for (let i = 0; i < pairs; i++) {
    rows.push(rowFor(name, leftVersions.get(gone[i]), rightVersions.get(came[i])))
  }
  for (let i = pairs; i < gone.length; i++) rows.push(rowFor(name, leftVersions.get(gone[i]), null))
  for (let i = pairs; i < came.length; i++)
    rows.push(rowFor(name, null, rightVersions.get(came[i])))
  return rows
}

// What the reader asked for comes first — it is the part they can act on.
function ordered(rows) {
  return rows.sort((a, b) => {
    if (a.direct !== b.direct) return a.direct ? -1 : 1
    if (a.name !== b.name) return a.name < b.name ? -1 : 1
    return RANK[a.status] - RANK[b.status]
  })
}

/**
 * @param {object} left  a parsed lockfile (see lockfile/parse)
 * @param {object} right
 * @returns {{rows: Array, stats: {added:number,removed:number,bumped:number,
 *   downgraded:number}, directCount:number, knowsDirect:boolean,
 *   identical:boolean}}
 */
export function diffLocks(left, right) {
  const a = index(left)
  const b = index(right)
  const rows = []
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    rows.push(...rowsForName(name, a.get(name), b.get(name)))
  }
  const stats = { added: 0, removed: 0, bumped: 0, downgraded: 0 }
  for (const row of rows) stats[row.status] += 1
  return {
    rows: ordered(rows),
    stats,
    directCount: rows.filter((r) => r.direct).length,
    // Only claim the split where BOTH sides recorded it; one side guessing is
    // the same as not knowing.
    knowsDirect: left?.knowsDirect === true && right?.knowsDirect === true,
    identical: rows.length === 0
  }
}
