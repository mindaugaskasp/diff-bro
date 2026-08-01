// The half of `make local-seed` that holds the real vault key.
//
// Spawned as a PLAIN electron process, never through Playwright: macOS denies a
// debugger-attached process the keychain item, Chromium silently falls back to
// an empty-password key, and the seed then writes a vault the real app can
// never read. That is why none of this runs in the app's renderer.
//
// CommonJS, and only modules whose import graph carries file extensions: the
// rest of src/main is bundler-targeted (share.js imports './appData') and will
// not load standalone. tests/scripts/seedWorker.test.js guards the three below.

const { app, safeStorage } = require('electron')
const { randomBytes, randomUUID } = require('node:crypto')
const { readFileSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const [payloadPath, resultPath] = process.argv.slice(-2)
const ROOT = join(__dirname, '..')

// Drives both getPath('userData') and the safeStorage keychain item, so it must
// match what `npm run dev` runs as or the seed lands where nothing looks.
app.setName(require(join(ROOT, 'package.json')).name)

const PLAIN_PREFIX = 'plain:'
const finish = (result) => {
  writeFileSync(resultPath, JSON.stringify(result))
  app.exit(result.error ? 1 : 0)
}

// --- key material (mirrors vault.js loadVaultKey / share.js decodeIdentity) ---

const unwrap = (raw) => {
  const isPlain = raw.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX
  // The "planted key" case vault.js refuses; refusing it here too keeps the seed
  // from writing past it.
  if (isPlain && safeStorage.isEncryptionAvailable()) throw new Error('unavailable')
  return isPlain ? raw.subarray(PLAIN_PREFIX.length).toString() : safeStorage.decryptString(raw)
}

const wrap = (json) =>
  safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(PLAIN_PREFIX + json)

function loadVaultKey(dataFile) {
  const path = dataFile('vault.key')
  try {
    return Buffer.from(unwrap(readFileSync(path)), 'base64')
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(
        'the vault key could not be unlocked — is the login keychain unlocked?\n' +
          '  (never overwritten: doing so would strand every saved diff and snippet)',
        { cause: err }
      )
    }
    const key = randomBytes(32).toString('base64')
    writeFileSync(path, wrap(key), { mode: 0o600 })
    return Buffer.from(key, 'base64')
  }
}

function loadIdentity(dataFile, createIdentityKeys) {
  try {
    return {
      priv: JSON.parse(unwrap(readFileSync(dataFile('identity.key')))),
      pub: JSON.parse(readFileSync(dataFile('identity.pub'), 'utf-8'))
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error('the identity key could not be unlocked', { cause: err })
    }
    const { priv, pub } = createIdentityKeys()
    writeFileSync(dataFile('identity.key'), wrap(JSON.stringify(priv)), { mode: 0o600 })
    writeFileSync(dataFile('identity.pub'), JSON.stringify(pub, null, 2))
    return { priv, pub }
  }
}

// --- stores ---

const readStore = (dataFile, name) => {
  try {
    return JSON.parse(readFileSync(dataFile(`${name}.json`), 'utf-8')) || {}
  } catch {
    return {}
  }
}
const writeStore = (dataFile, name, value) =>
  writeFileSync(dataFile(`${name}.json`), JSON.stringify(value), { mode: 0o600 })

const yours = (list, seedTag) => (list ?? []).filter((e) => !e.tags?.includes(seedTag))

// Mirrors snippetStore.registerTags closely enough for a fixture.
function tagRegistrar(tags, palette) {
  let rank = Object.keys(tags).length
  return (names) => {
    const out = []
    for (const raw of names ?? []) {
      const n = String(raw).trim().toLowerCase().slice(0, 40)
      if (!n || out.includes(n) || out.length >= 20) continue
      if (!tags[n])
        tags[n] = { color: palette[Object.keys(tags).length % palette.length], rank: ++rank }
      out.push(n)
    }
    return out
  }
}

function buildSnippets(list, ensure, seal) {
  const out = []
  let at = Date.now()
  for (const s of list) {
    const id = randomUUID()
    const aadSalt = randomUUID()
    const createdAt = at
    at -= 3 * 3600_000
    const fmt =
      s.language && s.language !== 'auto' && s.language !== 'plaintext' ? s.language : null
    out.push({
      id,
      aadSalt,
      name: s.name,
      createdAt,
      updatedAt: createdAt,
      language: s.language,
      detected: s.language,
      favorite: !!s.favorite,
      secret: s.secret === true,
      tags: ensure(fmt ? [fmt, ...s.tags] : s.tags),
      ...seal(s.content, [id, aadSalt, createdAt].join('|'))
    })
  }
  return out
}

function buildDiffs(list, ensure, seal) {
  return list.map((d) => {
    const id = randomUUID()
    const from = d.from ?? null
    return {
      id,
      name: d.name,
      createdAt: d.createdAt,
      expiresAt: d.expiresAt,
      from,
      favorite: !!d.favorite,
      tags: ensure(d.tags),
      sharedTo: [],
      ...seal(JSON.stringify(d.payload), [id, d.createdAt, d.expiresAt, from ?? ''].join('|'))
    }
  })
}

// --- trusted keys + sealed shares ---

function storeRecipients(dataFile, recipients, keyPrefix, fingerprint) {
  const existing = (() => {
    try {
      const list = JSON.parse(readFileSync(dataFile('trusted-keys.json'), 'utf-8'))
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  })()
  const kept = existing.filter((t) => !String(t.label ?? '').startsWith(keyPrefix))
  const added = recipients.map((r) => ({
    fingerprint: fingerprint(r.pub.sign, r.pub.box),
    label: r.label,
    sign: r.pub.sign,
    box: r.pub.box
  }))
  writeFileSync(dataFile('trusted-keys.json'), JSON.stringify([...kept, ...added], null, 2))
  return { added, removed: existing.length - kept.length }
}

function writeSealed({ dir, specs, trusted, identity, sealing }) {
  const { sealEntry, shareFilename } = sealing
  const out = []
  for (const spec of specs) {
    const to = spec.all ? trusted : trusted.slice(0, 1)
    if (!to.length) continue
    const file = sealEntry(
      {
        name: spec.name,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 3600_000,
        snapshot: spec.snapshot
      },
      { priv: identity.priv, fingerprint: identity.pub.fingerprint },
      to
    )
    const path = join(dir, shareFilename(file))
    writeFileSync(path, JSON.stringify(file, null, 2))
    out.push(path)
  }
  return out
}

const dirOf = (dataFile) => dataFile('.').replace(/[/\\]\.$/, '')

function runClean({ dataFile, sealing, payload, stores }) {
  const { snippetStore, vaultStore } = stores
  const before = (snippetStore.entries ?? []).length + (vaultStore.entries ?? []).length
  const snippets = yours(snippetStore.entries, payload.seedTag)
  const diffs = yours(vaultStore.entries, payload.seedTag)
  writeStore(dataFile, 'snippets', { tags: snippetStore.tags ?? {}, entries: snippets })
  writeStore(dataFile, 'vault', { entries: diffs })
  const keys = storeRecipients(dataFile, [], payload.keyPrefix, sealing.fingerprint)
  rmSync(payload.seedDir, { recursive: true, force: true })
  return {
    ok: true,
    removed: before - snippets.length - diffs.length,
    keys: keys.removed,
    dataDir: dirOf(dataFile)
  }
}

// The entry shapes above are duplicated from the stores, so drift would surface
// as a library the app quietly refuses to open. Fail here instead.
function verify({ vaultDecrypt, key, snippets, diffs }) {
  const ok = (entry, aad) => vaultDecrypt(key, { iv: entry.iv, data: entry.data }, aad) !== null
  const s = snippets[0]
  const d = diffs[0]
  const snippetOk = !s || ok(s, [s.id, s.aadSalt, s.createdAt].join('|'))
  const diffOk = !d || ok(d, [d.id, d.createdAt, d.expiresAt, d.from ?? ''].join('|'))
  if (!snippetOk || !diffOk) throw new Error('wrote entries this build cannot read back')
}

function runSeed({ dataFile, sealing, crypt, payload, stores }) {
  const { snippetStore, vaultStore } = stores
  const key = loadVaultKey(dataFile)
  const seal = (text, aad) => crypt.vaultEncrypt(key, text, aad)
  const tags = { ...(snippetStore.tags ?? {}) }
  const ensure = tagRegistrar(tags, payload.palette)

  const newSnippets = buildSnippets(payload.snippets, ensure, seal)
  const newDiffs = buildDiffs(payload.diffs, ensure, seal)
  const keptSnippets = yours(snippetStore.entries, payload.seedTag)
  const keptDiffs = yours(vaultStore.entries, payload.seedTag)

  writeStore(dataFile, 'snippets', { tags, entries: [...newSnippets, ...keptSnippets] })
  writeStore(dataFile, 'vault', { entries: [...newDiffs, ...keptDiffs] })

  const { added: trusted } = storeRecipients(
    dataFile,
    payload.recipients,
    payload.keyPrefix,
    sealing.fingerprint
  )
  const identity = loadIdentity(dataFile, sealing.createIdentityKeys)
  const sealed = writeSealed({
    dir: payload.seedDir,
    specs: payload.sealed,
    trusted,
    identity,
    sealing
  })

  verify({ vaultDecrypt: crypt.vaultDecrypt, key, snippets: newSnippets, diffs: newDiffs })

  return {
    ok: true,
    snippets: newSnippets.length,
    diffs: newDiffs.length,
    kept: keptSnippets.length + keptDiffs.length,
    keys: trusted.length,
    sealed,
    dataDir: dirOf(dataFile)
  }
}

async function run() {
  const payload = JSON.parse(readFileSync(payloadPath, 'utf-8'))
  const src = join(ROOT, 'src', 'main')
  const { dataFile } = await import(join(src, 'appData.js'))
  const crypt = await import(join(src, 'vaultCrypt.js'))
  const sealing = await import(join(src, 'sealing.js'))
  const stores = {
    snippetStore: readStore(dataFile, 'snippets'),
    vaultStore: readStore(dataFile, 'vault')
  }
  const args = { dataFile, sealing, crypt, payload, stores }
  return payload.clean ? runClean(args) : runSeed(args)
}

app
  .whenReady()
  .then(run)
  .then(finish)
  .catch((err) => finish({ error: err?.message ?? String(err) }))
