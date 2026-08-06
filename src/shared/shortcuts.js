// The quick look-up launcher's default binding. Shared because two processes
// need the same answer: the renderer stores and displays it, main registers it
// with the OS, and a comment asking the two to be kept in step is how they
// drifted before.

// What every install before this change stored, on every platform.
export const LEGACY_QUICKLOOK_SHORTCUT = 'CommandOrControl+Shift+Space'

// Ctrl+Shift+Space is parameter-info in most Windows editors and IDEs, so
// grabbing it globally fights whatever the user is typing into.
const BY_PLATFORM = { win32: 'Control+Alt+Space' }

/**
 * @param {NodeJS.Platform|string} platform
 * @returns {string} Electron accelerator
 */
export const defaultQuickLookShortcut = (platform) =>
  BY_PLATFORM[platform] ?? LEGACY_QUICKLOOK_SHORTCUT

/**
 * The binding to use, applying the one-time move off the old default.
 *
 * Changing the default alone reaches nobody: anyone who has run the app has the
 * old value STORED, which is everyone who reported the collision. `migrated` is
 * what keeps this to once — without it, a Windows user who deliberately picks
 * the old combination would have it taken away at every launch.
 *
 * @param {{ stored: string|null, migrated: boolean, fallback: string }} spec
 * @returns {string}
 */
export function migratedQuickLookShortcut({ stored, migrated, fallback }) {
  if (typeof stored !== 'string' || !stored.trim()) return fallback
  if (migrated !== true && stored === LEGACY_QUICKLOOK_SHORTCUT) return fallback
  return stored
}
