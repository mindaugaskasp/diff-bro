// The quick look-up launcher's default binding. Shared because two processes
// need the same answer: the renderer stores and displays it, main registers it
// with the OS, and a comment asking the two to be kept in step is how they
// drifted before.

const QUICKLOOK_SHORTCUT = 'CommandOrControl+Shift+Space'

// Ctrl+Shift+Space is parameter-info in most Windows editors and IDEs, so
// grabbing it globally fights whatever the user is typing into.
const BY_PLATFORM = { win32: 'Control+Alt+Space' }

/**
 * @param {NodeJS.Platform|string} platform
 * @returns {string} Electron accelerator
 */
export const defaultQuickLookShortcut = (platform) => BY_PLATFORM[platform] ?? QUICKLOOK_SHORTCUT

/**
 * @param {string|null|undefined} stored
 * @param {string} fallback
 * @returns {string} the stored binding, or the fallback when there is none
 */
export const storedQuickLookShortcut = (stored, fallback) =>
  typeof stored === 'string' && stored.trim() ? stored : fallback
