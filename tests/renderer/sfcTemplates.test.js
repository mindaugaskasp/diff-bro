import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { compileTemplate, parse } from '@vue/compiler-sfc'

const ROOT = join(__dirname, '../../src/renderer/src')

function vueFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

// Production builds skip some template checks (a <transition> with two children among
// them), so an error only the dev build reports could otherwise ship unnoticed.
describe('every component template', () => {
  it.each(vueFiles(ROOT).map((path) => [relative(ROOT, path), path]))(
    '%s compiles without errors',
    (_name, path) => {
      const { descriptor } = parse(readFileSync(path, 'utf8'), { filename: path })
      if (!descriptor.template) return
      const { errors } = compileTemplate({
        source: descriptor.template.content,
        filename: path,
        id: 'test',
        isProd: false
      })
      expect(errors.map(String)).toEqual([])
    }
  )
})
