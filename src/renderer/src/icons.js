// SVG icon geometry, Feather/Lucide-style on a 24×24 grid. Icons are drawn as
// SVG, never as Unicode glyphs, so nothing renders as a tofu box on a font that
// happens to lack a symbol (◈, ⧉, ⤢, ⛶ … all did). Each icon is a list of
// primitive elements; AppIcon.vue renders them inside one shared <svg>.
//
// Elements: { t: 'path'|'rect'|'circle'|'line', ...attrs }. A `fill: true`
// element is solid (stroke off); everything else is a stroked outline.
export const ICONS = {
  // A small flowchart — marks a Mermaid snippet and opens its viewer.
  diagram: [
    { t: 'rect', x: 3, y: 3, width: 8, height: 8, rx: 2 },
    { t: 'rect', x: 13, y: 13, width: 8, height: 8, rx: 2 },
    { t: 'path', d: 'M7 11v4a2 2 0 0 0 2 2h4' }
  ],
  copy: [
    { t: 'rect', x: 9, y: 9, width: 13, height: 13, rx: 2 },
    { t: 'path', d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }
  ],
  // An envelope — the mail hand-off (Email this diff, Settings → Email).
  mail: [
    { t: 'rect', x: 2, y: 4, width: 20, height: 16, rx: 2 },
    { t: 'path', d: 'm2 7 10 6 10-6' }
  ],
  // A clipboard with a sheet on it — "Copy as file", the twin of `copy`.
  clipboard: [
    { t: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
    { t: 'rect', x: 8, y: 2, width: 8, height: 4, rx: 1 },
    { t: 'path', d: 'M9 13h6M9 17h4' }
  ],
  // A crest — marks a recipient resolved from a trusted key rather than typed.
  shield: [{ t: 'path', d: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z' }],
  x: [{ t: 'path', d: 'M18 6 6 18M6 6l12 12' }],
  // A framed band between two out-of-frame lines: the window a streamed
  // comparison holds onto a file far longer than it.
  stream: [
    { t: 'path', d: 'M5 4h14' },
    { t: 'path', d: 'M5 20h14' },
    { t: 'rect', x: 3, y: 9, width: 18, height: 6, rx: 1 }
  ],
  // Trash can — the destructive delete action on a row.
  trash: [
    { t: 'path', d: 'M3 6h18' },
    { t: 'path', d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' },
    { t: 'path', d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' },
    { t: 'line', x1: 10, y1: 11, x2: 10, y2: 17 },
    { t: 'line', x1: 14, y1: 11, x2: 14, y2: 17 }
  ],
  // Open tray — the quiet empty-state mark for a section with no entries.
  inbox: [
    { t: 'path', d: 'M22 12h-6l-2 3h-4l-2-3H2' },
    {
      t: 'path',
      d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'
    }
  ],
  // Magnifying glass — marks the filter/search inputs.
  search: [
    { t: 'circle', cx: 11, cy: 11, r: 7 },
    { t: 'line', x1: 21, y1: 21, x2: 16.5, y2: 16.5 }
  ],
  star: [
    {
      t: 'path',
      d: 'M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94z'
    }
  ],
  'star-filled': [
    {
      t: 'path',
      fill: true,
      d: 'M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94z'
    }
  ],
  'chevron-right': [{ t: 'path', d: 'm9 6 6 6-6 6' }],
  'chevron-left': [{ t: 'path', d: 'm15 6-6 6 6 6' }],
  'chevron-up': [{ t: 'path', d: 'm6 15 6-6 6 6' }],
  'git-merge': [
    { t: 'circle', cx: '18', cy: '18', r: '3' },
    { t: 'circle', cx: '6', cy: '6', r: '3' },
    { t: 'path', d: 'M6 21V9a9 9 0 0 0 9 9' }
  ],
  'chevron-down': [{ t: 'path', d: 'm6 9 6 6 6-6' }],
  'arrow-up': [
    { t: 'path', d: 'M12 19V5' },
    { t: 'path', d: 'm5 12 7-7 7 7' }
  ],
  'arrow-down': [
    { t: 'path', d: 'M12 5v14' },
    { t: 'path', d: 'm19 12-7 7-7-7' }
  ],
  // Diagonal share arrow (out of the box).
  // A floppy disk — Save, when the toolbar is too narrow to spell it out.
  save: [
    { t: 'path', d: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z' },
    { t: 'path', d: 'M17 21v-8H7v8' },
    { t: 'path', d: 'M7 3v5h8' }
  ],
  share: [
    { t: 'path', d: 'M9 15 20 4' },
    { t: 'path', d: 'M15 4h5v5' },
    { t: 'path', d: 'M20 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6' }
  ],
  // Three dots — the toolbar's overflow menu, holding whatever the bar could
  // not fit. Same filled-circle idiom as `grip`, laid across instead of down.
  'more-horizontal': [
    { t: 'circle', cx: 5, cy: 12, r: 1.4, fill: true },
    { t: 'circle', cx: 12, cy: 12, r: 1.4, fill: true },
    { t: 'circle', cx: 19, cy: 12, r: 1.4, fill: true }
  ],
  grip: [
    { t: 'circle', cx: 9, cy: 6, r: 1.1, fill: true },
    { t: 'circle', cx: 9, cy: 12, r: 1.1, fill: true },
    { t: 'circle', cx: 9, cy: 18, r: 1.1, fill: true },
    { t: 'circle', cx: 15, cy: 6, r: 1.1, fill: true },
    { t: 'circle', cx: 15, cy: 12, r: 1.1, fill: true },
    { t: 'circle', cx: 15, cy: 18, r: 1.1, fill: true }
  ],
  lock: [
    { t: 'rect', x: 4, y: 11, width: 16, height: 10, rx: 2 },
    { t: 'path', d: 'M8 11V7a4 4 0 0 1 8 0v4' }
  ],
  // Reveal / hide a secret snippet's contents.
  eye: [
    { t: 'path', d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' },
    { t: 'circle', cx: 12, cy: 12, r: 3 }
  ],
  // The same eye, struck through — contents currently hidden.
  'eye-off': [
    { t: 'path', d: 'M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.2 4.2' },
    { t: 'path', d: 'M6.5 6.6A18.2 18.2 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 4.5-1' },
    { t: 'path', d: 'M9.9 9.9a3 3 0 0 0 4.2 4.2' },
    { t: 'line', x1: 3, y1: 3, x2: 21, y2: 21 }
  ],
  // Open padlock — the shackle swung clear of the body.
  unlock: [
    { t: 'rect', x: 4, y: 11, width: 16, height: 10, rx: 2 },
    { t: 'path', d: 'M8 11V7a4 4 0 0 1 7.7-2.3' }
  ],
  edit: [
    { t: 'path', d: 'M12 20h9' },
    { t: 'path', d: 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z' }
  ],
  sun: [
    { t: 'circle', cx: 12, cy: 12, r: 4 },
    { t: 'path', d: 'M12 2v2' },
    { t: 'path', d: 'M12 20v2' },
    { t: 'path', d: 'm4.9 4.9 1.4 1.4' },
    { t: 'path', d: 'm17.7 17.7 1.4 1.4' },
    { t: 'path', d: 'M2 12h2' },
    { t: 'path', d: 'M20 12h2' },
    { t: 'path', d: 'm6.3 17.7-1.4 1.4' },
    { t: 'path', d: 'm19.1 4.9-1.4 1.4' }
  ],
  moon: [{ t: 'path', d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z' }],
  // Arrows to the four corners — expand a panel to a larger view.
  expand: [
    { t: 'path', d: 'M15 3h6v6' },
    { t: 'path', d: 'M9 21H3v-6' },
    { t: 'path', d: 'm21 3-7 7' },
    { t: 'path', d: 'm3 21 7-7' }
  ],
  maximize: [
    { t: 'path', d: 'M8 3H5a2 2 0 0 0-2 2v3' },
    { t: 'path', d: 'M21 8V5a2 2 0 0 0-2-2h-3' },
    { t: 'path', d: 'M3 16v3a2 2 0 0 0 2 2h3' },
    { t: 'path', d: 'M16 21h3a2 2 0 0 0 2-2v-3' }
  ],
  restore: [
    { t: 'path', d: 'M8 3v3a2 2 0 0 1-2 2H3' },
    { t: 'path', d: 'M21 8h-3a2 2 0 0 1-2-2V3' },
    { t: 'path', d: 'M3 16h3a2 2 0 0 1 2 2v3' },
    { t: 'path', d: 'M16 21v-3a2 2 0 0 1 2-2h3' }
  ],
  check: [{ t: 'path', d: 'M20 6 9 17l-5-5' }],
  minus: [{ t: 'path', d: 'M5 12h14' }],
  plus: [
    { t: 'path', d: 'M5 12h14' },
    { t: 'path', d: 'M12 5v14' }
  ],
  file: [
    { t: 'path', d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z' },
    { t: 'path', d: 'M14 2v4a2 2 0 0 0 2 2h4' }
  ],
  // Names a saved-diff category (folder-tree treatment in SavedDiffsSection).
  folder: [
    {
      t: 'path',
      d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z'
    }
  ],
  // Grid — marks the spreadsheet (.xlsx) format in the supported-types hint.
  table: [
    { t: 'rect', x: 3, y: 4, width: 18, height: 16, rx: 2 },
    { t: 'path', d: 'M3 10h18M3 15h18M9 4v16M15 4v16' }
  ],
  // Angle brackets — marks code/markup formats (JSON, XML, and the like).
  code: [{ t: 'path', d: 'm8 8-4 4 4 4M16 8l4 4-4 4' }],
  // Rich-text formatting toolbar (Jira/Confluence wiki markup).
  bold: [
    { t: 'path', d: 'M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z' },
    { t: 'path', d: 'M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z' }
  ],
  italic: [
    { t: 'line', x1: 19, y1: 4, x2: 10, y2: 4 },
    { t: 'line', x1: 14, y1: 20, x2: 5, y2: 20 },
    { t: 'line', x1: 15, y1: 4, x2: 9, y2: 20 }
  ],
  underline: [
    { t: 'path', d: 'M6 3v7a6 6 0 0 0 12 0V3' },
    { t: 'line', x1: 4, y1: 21, x2: 20, y2: 21 }
  ],
  strikethrough: [
    { t: 'path', d: 'M16 4H9a3 3 0 0 0-2.83 4' },
    { t: 'path', d: 'M14 12a4 4 0 0 1 0 8H6' },
    { t: 'line', x1: 4, y1: 12, x2: 20, y2: 12 }
  ],
  // { } braces — a {code}/{quote} block.
  braces: [
    { t: 'path', d: 'M7 4a2 2 0 0 0-2 2v2a2 2 0 0 1-2 2 2 2 0 0 1 2 2v2a2 2 0 0 0 2 2' },
    { t: 'path', d: 'M17 4a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2' }
  ],
  quote: [
    { t: 'line', x1: 4, y1: 5, x2: 4, y2: 19 },
    { t: 'line', x1: 9, y1: 7, x2: 20, y2: 7 },
    { t: 'line', x1: 9, y1: 12, x2: 20, y2: 12 },
    { t: 'line', x1: 9, y1: 17, x2: 16, y2: 17 }
  ],
  list: [
    { t: 'line', x1: 9, y1: 6, x2: 20, y2: 6 },
    { t: 'line', x1: 9, y1: 12, x2: 20, y2: 12 },
    { t: 'line', x1: 9, y1: 18, x2: 20, y2: 18 },
    { t: 'circle', cx: 4.5, cy: 6, r: 1.1, fill: true },
    { t: 'circle', cx: 4.5, cy: 12, r: 1.1, fill: true },
    { t: 'circle', cx: 4.5, cy: 18, r: 1.1, fill: true }
  ],
  'list-ordered': [
    { t: 'line', x1: 10, y1: 6, x2: 21, y2: 6 },
    { t: 'line', x1: 10, y1: 12, x2: 21, y2: 12 },
    { t: 'line', x1: 10, y1: 18, x2: 21, y2: 18 },
    { t: 'path', d: 'M4 4h1v4' },
    { t: 'path', d: 'M4 8h2' },
    { t: 'path', d: 'M4 14h2v1.5H4V17h2' }
  ],
  link: [
    { t: 'path', d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
    { t: 'path', d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }
  ],
  // Wrench — marks the sidebar Tools launcher.
  wrench: [
    {
      t: 'path',
      d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'
    }
  ],
  // Shield with a check — an external diff was sealed by, and imported from, a
  // trusted sender (openSealed rejects any other), so the mark is always honest.
  'shield-check': [
    { t: 'path', d: 'M12 2.5 4.5 5.5v5.5c0 4.7 3.2 7.6 7.5 10 4.3-2.4 7.5-5.3 7.5-10V5.5z' },
    { t: 'path', d: 'm9 12 2 2 4-4' }
  ],
  // Clock — the Epoch / Date tool's mark and its live "now" readout.
  clock: [
    { t: 'circle', cx: 12, cy: 12, r: 9 },
    { t: 'path', d: 'M12 7v5l3.5 2' }
  ],
  // Calendar — the date-picker lane of the Epoch tool.
  calendar: [
    { t: 'rect', x: 3, y: 5, width: 18, height: 16, rx: 2 },
    { t: 'path', d: 'M3 9h18M8 3v4M16 3v4' }
  ],
  // Hash — the UUID tool's mark.
  hash: [{ t: 'path', d: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18' }],
  // Nested arches — a checksum identifies a file the way a print identifies a
  // hand, which is the whole idea the tool trades on.
  fingerprint: [
    { t: 'path', d: 'M12 11a2 2 0 0 1 2 2c0 2.5-.4 4.8-1.2 6.9' },
    { t: 'path', d: 'M8.5 13a3.5 3.5 0 0 1 7 0c0 3-.5 5.7-1.5 8' },
    { t: 'path', d: 'M5 13a7 7 0 0 1 14 0c0 1.6-.1 3.2-.4 4.7' },
    { t: 'path', d: 'M5.5 8.5a7.8 7.8 0 0 1 13 0' }
  ],
  // The bracket-star-bracket of a pattern: /.*/ read as a shape.
  regex: [
    { t: 'path', d: 'M8 4 5 12l3 8M16 4l3 8-3 8' },
    { t: 'path', d: 'M12 9v6M9.5 10.5l5 3M14.5 10.5l-5 3' }
  ],
  // Encoded bytes in a frame — the Base64 tool's mark.
  binary: [
    { t: 'rect', x: 3, y: 5, width: 18, height: 14, rx: 2 },
    { t: 'path', d: 'm10 10-2 2 2 2M14 10l2 2-2 2' }
  ],
  // Tag — the HTML entities tool's mark.
  tag: [
    {
      t: 'path',
      d: 'M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z'
    },
    { t: 'circle', cx: 7.5, cy: 7.5, r: 1.1, fill: true }
  ],
  // Two arrows swapping — the Find & Replace tool's mark.
  replace: [
    { t: 'path', d: 'm16 3 4 4-4 4' },
    { t: 'path', d: 'M20 7H9a5 5 0 0 0-5 5' },
    { t: 'path', d: 'm8 21-4-4 4-4' },
    { t: 'path', d: 'M4 17h11a5 5 0 0 0 5-5' }
  ],
  // Two lanes running opposite ways — exchanging the left and right files.
  swap: [
    { t: 'path', d: 'M4 9h16M16 5l4 4-4 4' },
    { t: 'path', d: 'M20 15H4M8 11l-4 4 4 4' }
  ],
  // A framed picture — exporting a saved diff as a shareable image.
  image: [
    { t: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 2 },
    { t: 'circle', cx: 8.5, cy: 8.5, r: 1.5 },
    { t: 'path', d: 'm21 15-4.5-4.5L6 21' }
  ]
}
