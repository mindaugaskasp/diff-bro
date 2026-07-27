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
  x: [{ t: 'path', d: 'M18 6 6 18M6 6l12 12' }],
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
  share: [
    { t: 'path', d: 'M9 15 20 4' },
    { t: 'path', d: 'M15 4h5v5' },
    { t: 'path', d: 'M20 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6' }
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
  code: [{ t: 'path', d: 'm8 8-4 4 4 4M16 8l4 4-4 4' }]
}
