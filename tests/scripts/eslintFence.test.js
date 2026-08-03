// Hard security rule 3: the renderer never imports Node or Electron, and
// no-restricted-imports is what enforces it. That rule is REPLACED, not merged,
// by any later config block matching the same files — so adding a layering rule
// for one renderer subdirectory silently drops the fence for every file in it.
// This asserts the fence survives in each place a narrower block exists.
import { describe, expect, it } from 'vitest'
import { loadESLint } from 'eslint'

const FENCED = [
  'src/renderer/src/utils/tools.js',
  'src/renderer/src/stores/diffStore.js',
  'src/renderer/src/composables/useCommands.js',
  'src/renderer/src/components/AppIcon.vue',
  'src/renderer/src/App.vue'
]

const configFor = async (file) => {
  const ESLint = await loadESLint({ useFlatConfig: true })
  return new ESLint().calculateConfigForFile(file)
}

describe('the renderer/main fence survives every narrower config block', () => {
  it.each(FENCED)('%s still bans Node built-ins and electron', async (file) => {
    const rule = (await configFor(file)).rules['no-restricted-imports']
    // calculateConfigForFile normalises severity to a number.
    expect(rule?.[0]).toBe(2)

    const options = rule[1]
    const groups = options.patterns.flatMap((p) => p.group)
    for (const banned of ['node:*', 'fs', 'child_process', 'crypto']) {
      expect(groups).toContain(banned)
    }
    expect(options.paths.map((p) => p.name)).toContain('electron')
  })

  // The layering rules are the reason the fence is at risk: they are what adds
  // a second block for a renderer subdirectory in the first place.
  it('keeps utils/ pure on top of the fence', async () => {
    const rule = (await configFor('src/renderer/src/utils/tools.js')).rules['no-restricted-imports']
    const groups = rule[1].patterns.flatMap((p) => p.group)
    expect(groups).toContain('vue')
    expect(groups).toContain('**/features/**')
  })

  it('keeps the core unable to import a feature slice', async () => {
    const rule = (await configFor('src/renderer/src/stores/diffStore.js')).rules[
      'no-restricted-imports'
    ]
    expect(rule[1].patterns.flatMap((p) => p.group)).toContain('**/features/**')
  })
})

// A pattern that is PRESENT but matches nothing reads exactly like a working
// one. `!(index)*` is not syntax to ESLint's matcher — it silently matched
// nothing, and the rule sat there looking enforced. These lint real source text.
describe('the import bans actually match', () => {
  const lintAs = async (file, source) => {
    const ESLint = await loadESLint({ useFlatConfig: true })
    const [result] = await new ESLint().lintText(source, { filePath: file })
    return result.messages.filter((m) => m.ruleId === 'no-restricted-imports')
  }

  it('bans reaching into a slice from outside it', async () => {
    const hits = await lintAs(
      'src/renderer/src/components/Probe.vue',
      "<script setup>\nimport x from '../features/configBackup/configBackupStore'\nconsole.log(x)\n</script>\n"
    )
    expect(hits).toHaveLength(1)
  })

  it('allows importing the slice itself', async () => {
    const hits = await lintAs(
      'src/renderer/src/components/Probe.vue',
      "<script setup>\nimport x from '../features/configBackup'\nconsole.log(x)\n</script>\n"
    )
    expect(hits).toEqual([])
  })

  it('lets a slice import the core it is allowed to read', async () => {
    const hits = await lintAs(
      'src/renderer/src/features/configBackup/probe.js',
      "import x from '../../stores/diffStore'\nexport default x\n"
    )
    expect(hits).toEqual([])
  })

  // From outside a slice the specifier carries `features/`; from INSIDE one a
  // sibling is `../imageExport/…`, which does not — and `../*/*` cannot stand in
  // because `*` matches `..` and would ban the core. These pin both directions.
  it.each([
    ['src/renderer/src/features/share/probe.js', "'../imageExport/imageExportStore'"],
    [
      'src/renderer/src/features/share/components/Probe.vue',
      "'../../imageExport/imageExportStore'"
    ],
    [
      'src/renderer/src/features/share/components/Probe.vue',
      "'../../imageExport/components/SnippetShot.vue'"
    ]
  ])('bans a sibling slice reached from %s', async (file, spec) => {
    const body = `import x from ${spec}`
    const src = file.endsWith('.vue')
      ? `<script setup>\n${body}\nconsole.log(x)\n</script>\n`
      : `${body}\nexport default x\n`
    expect(await lintAs(file, src)).toHaveLength(1)
  })

  it.each([
    ['src/renderer/src/features/share/probe.js', "'../imageExport'"],
    ['src/renderer/src/features/share/probe.js', "'./shareStore'"],
    ['src/renderer/src/features/share/probe.js', "'../../stores/diffStore'"],
    ['src/renderer/src/features/share/components/Probe.vue', "'../../../stores/diffStore'"],
    ['src/renderer/src/features/share/components/Probe.vue', "'../shareStore'"],
    ['src/renderer/src/features/share/components/Probe.vue', "'../../../components/BaseDialog.vue'"]
  ])('allows %s to import %s', async (file, spec) => {
    const body = `import x from ${spec}`
    const src = file.endsWith('.vue')
      ? `<script setup>\n${body}\nconsole.log(x)\n</script>\n`
      : `${body}\nexport default x\n`
    expect(await lintAs(file, src)).toEqual([])
  })

  it('bans a Node built-in in the renderer', async () => {
    const hits = await lintAs(
      'src/renderer/src/utils/probe.js',
      "import fs from 'fs'\nexport default fs\n"
    )
    expect(hits).toHaveLength(1)
  })
})
