/**
 * What the snippet status bar reports. An empty snippet is one empty line, as an editor shows it.
 * @param {string} text
 * @returns {{ lines: number, characters: number }}
 */
export function contentStats(text = '') {
  return { lines: text.split(/\r\n|\r|\n/).length, characters: [...text].length }
}
