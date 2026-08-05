import { describe, expect, it } from 'vitest'
import { catalogueKeys, dynamicKeyLines, keysUsedIn } from '../../scripts/lib/i18nKeys.mjs'

describe('keysUsedIn', () => {
  it('finds t() in script and $t() in a template', () => {
    const src = `
      const a = t('menu.file.save')
      <span>{{ $t('common.cancel') }}</span>
    `
    expect(keysUsedIn(src)).toEqual(['common.cancel', 'menu.file.save'])
  })

  it('finds a key passed with interpolation arguments', () => {
    expect(keysUsedIn(`t('reportIssue.leavesApp', { url: BASE })`)).toEqual([
      'reportIssue.leavesApp'
    ])
  })

  it('accepts double quotes, which templates use for attributes', () => {
    expect(keysUsedIn(`:aria-label="$t('settings.language.label')"`)).toEqual([
      'settings.language.label'
    ])
  })

  it('reports each key once however often it is used', () => {
    expect(keysUsedIn(`t('common.cancel'); t('common.cancel')`)).toEqual(['common.cancel'])
  })

  // The guard's blind spot, so it has to be named rather than silently missed.
  // `t(\`menu.\${id}\`)` cannot be resolved statically.
  it('does not mistake a template literal for a key', () => {
    expect(keysUsedIn('t(`menu.${id}`)')).toEqual([])
  })

  it('ignores a bare t( with a variable, which is not a literal key', () => {
    expect(keysUsedIn('t(someKey)')).toEqual([])
  })

  // `.filter(t => t.pinned)` and `v-for="t in THEMES"` are everywhere in this
  // codebase — a naive /t\(/ would treat them as translation calls.
  // utils/ is pure and cannot call t(), so it exports key IDs on a `*Key`
  // property and the component resolves them. Without this the guard sees every
  // shortcut label as an unused catalogue entry.
  it('counts a *Key property holding a literal as a use', () => {
    expect(keysUsedIn(`{ keys: 'X', labelKey: 'shortcuts.openLeft' }`)).toEqual([
      'shortcuts.openLeft'
    ])
    expect(keysUsedIn(`titleKey: 'export.html'`)).toEqual(['export.html'])
  })

  it('ignores a *Key property whose value is not a dotted path', () => {
    expect(keysUsedIn(`sortKey: 'name'`)).toEqual([])
    expect(keysUsedIn(`storeKey: 'diffbro.vault'`)).toEqual(['diffbro.vault'])
  })

  it('is not fooled by an identifier ending in t', () => {
    expect(keysUsedIn(`format('a.b'); await import('x.y'); split('c.d')`)).toEqual([])
  })
})

describe('dynamicKeyLines', () => {
  it('reports a template-literal key so the blind spot is visible', () => {
    const found = dynamicKeyLines('const x = 1\nt(`menu.${id}`)\n')
    expect(found).toEqual([{ line: 2, text: 't(`menu.${id}`)' }])
  })

  it('is empty when every key is a literal', () => {
    expect(dynamicKeyLines(`t('a.b')`)).toEqual([])
  })

  // A key held in a variable is just as invisible to the literal scan as a
  // template literal, and reads as an ordinary call. files.js does exactly this
  // (`t(spec.titleKey)`), and only the unused-key warning noticed.
  it('reports a key passed as a variable, not just a template literal', () => {
    expect(dynamicKeyLines('t(spec.titleKey)')).toEqual([{ line: 1, text: 't(spec.titleKey)' }])
    expect(dynamicKeyLines('$t(someKey)')).toEqual([{ line: 1, text: '$t(someKey)' }])
  })

  // Prose describing t() is not a call site. A JSDoc line reading
  // "`t(key, argsOrCount)` over the catalogue" was reported as one.
  it('ignores comment lines', () => {
    expect(dynamicKeyLines(' * A bare `t(key, args)` over the catalogue')).toEqual([])
    expect(dynamicKeyLines('// t(whatever) explained here')).toEqual([])
    expect(dynamicKeyLines('/* t(x) */')).toEqual([])
  })
})

describe('catalogueKeys', () => {
  it('flattens nested groups into dotted paths', () => {
    expect(catalogueKeys({ menu: { file: { title: 'File' } }, a: 'A' })).toEqual([
      'a',
      'menu.file.title'
    ])
  })

  it('is empty for an empty catalogue', () => {
    expect(catalogueKeys({})).toEqual([])
  })
})
