// The approved menu map (specs/2026-10-27-label-vocabulary): every item as its
// path of labels. Both menus, native and in-app, are held to this one list.
export const MENU_MAP = [
  'File ▸ Open Left',
  'File ▸ Open Right',
  'File ▸ Open File as Snippet…',
  'File ▸ Save',
  'File ▸ Share',
  'File ▸ Import ▸ Shared Diff…',
  'File ▸ Import ▸ Snippets…',
  'File ▸ Export ▸ Diff as HTML…',
  'File ▸ Export ▸ Diff as Image…',
  'File ▸ Export ▸ Snippet as File…',
  'File ▸ Export ▸ All Snippets…',
  'File ▸ New Comparison',
  'File ▸ Close Comparison',
  'File ▸ Next Comparison',
  'File ▸ Previous Comparison',
  'File ▸ Settings…',
  'Edit ▸ Swap Sides',
  'Edit ▸ Copy ▸ Diff as Patch',
  'Edit ▸ Copy ▸ Diff as File',
  'Edit ▸ Copy ▸ Left Side',
  'Edit ▸ Copy ▸ Right Side',
  'Edit ▸ Apply Patch…',
  'Edit ▸ Paste Mode',
  'View ▸ Command Palette…',
  'View ▸ Toggle Sidebar',
  'View ▸ Display ▸ Structure View',
  'View ▸ Display ▸ Split View',
  'View ▸ Display ▸ Ignore Whitespace',
  'View ▸ Display ▸ Focus on Changes',
  'View ▸ Toggle Light/Dark Theme',
  'View ▸ Presentation Mode',
  'View ▸ Quick Look-up',
  'View ▸ Merge Conflicts…',
  'View ▸ Zoom ▸ Zoom In',
  'View ▸ Zoom ▸ Zoom Out',
  'View ▸ Zoom ▸ Reset Zoom',
  'Security ▸ My Key ▸ Share My Public Key…',
  'Security ▸ My Key ▸ Replace My Key…',
  'Security ▸ Trusted Keys ▸ Add Trusted Key…',
  'Security ▸ Trusted Keys ▸ Manage Trusted Keys…',
  'Security ▸ Configuration ▸ Back Up…',
  'Security ▸ Configuration ▸ Restore…',
  'Tools ▸ Encode ▸ Base64',
  'Tools ▸ Encode ▸ URL Encode / Decode',
  'Tools ▸ Format ▸ JSON',
  'Tools ▸ Format ▸ XML',
  'Tools ▸ Format ▸ Lines',
  'Tools ▸ Generate ▸ UUID',
  'Tools ▸ Generate ▸ Epoch / Date',
  'Tools ▸ Generate ▸ Checksum / Hash',
  'Tools ▸ Inspect ▸ JWT Decode',
  'Tools ▸ Inspect ▸ Regex Tester',
  'Tools ▸ Secure ▸ Encrypt / Decrypt',
  'Help ▸ Keyboard Shortcuts',
  'Help ▸ Show Tour',
  'Help ▸ Terminal Commands & Setup…',
  'Help ▸ Report an Issue…'
]

/**
 * Leaf paths of a menu tree. `children` names the submenu key; `skip` drops
 * rows that are not commands (separators, roles, the version line, dev-only).
 */
export function menuPaths(tree, children, skip, prefix = []) {
  const out = []
  for (const item of tree) {
    if (skip(item)) continue
    const path = [...prefix, item.label]
    if (item[children]) out.push(...menuPaths(item[children], children, skip, path))
    else out.push(path.join(' ▸ '))
  }
  return out
}
