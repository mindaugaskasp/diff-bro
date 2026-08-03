// Where a vertical slice keeps its stylesheets. Discovered rather than listed,
// so adding a slice cannot leave its CSS outside the style and theme guards —
// which is the one way a directory move passes CI while removing enforcement.

import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

// This file lives in scripts/lib, so the repo root is two levels up.
const root = fileURLToPath(new URL('../..', import.meta.url))
export const FEATURES_DIR = 'src/renderer/src/features'

export function featureNames() {
  const base = join(root, FEATURES_DIR)
  if (!existsSync(base)) return []
  return readdirSync(base).filter((name) => statSync(join(base, name)).isDirectory())
}

export function featureStyleDirs() {
  return featureNames()
    .map((name) => `${FEATURES_DIR}/${name}/components/styles`)
    .filter((dir) => existsSync(join(root, dir)))
}
