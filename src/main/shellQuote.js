// Quoting for the /bin/sh scripts this app generates (the CLI shim and the git
// difftool wrapper). The app path is interpolated into them, and a path holding
// a quote or a $(…) would otherwise end the string and run the rest.

/**
 * A string as ONE literal /bin/sh word. Single quotes suppress every expansion;
 * the only character they cannot hold is a single quote itself, which is closed,
 * escaped and reopened.
 * @param {string} value
 * @returns {string}
 */
export function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}
