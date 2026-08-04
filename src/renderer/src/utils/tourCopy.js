// Every word the onboarding tour says, keyed by step id. Apart from the schedule
// in tourSteps.js so wording can be revised without reading any of it.
//
// `nextLabel` replaces the primary's "Next" when that press DOES something —
// a button about to open a window should say so. `{shortcut}` is filled in at
// render time with the quick look-up chord as the user has it bound.

/** @type {Record<string, { title: string, body: string, nextLabel?: string }>} */
export const TOUR_COPY = {
  compare: {
    title: 'Two files, any way you like',
    body: 'Drop them anywhere on this window, or click a slot to browse. Diff Bro picks the viewer for you — text, JSON tree, spreadsheet grid or diagram.',
    nextLabel: 'Load a demo pair'
  },
  share: {
    title: 'Send it sealed, not screenshotted',
    body: 'Share locks this comparison so only the people you pick can open it, and it stops opening after however long you choose. First time with someone, you swap a small key file: Security ▸ Share My Public Key sends yours, Security ▸ Add Trusted Key takes theirs. After that it is two clicks.'
  },
  library: {
    title: 'Your library, narrowing as you type',
    body: 'Saved diffs, shared diffs and snippets all live here. Watch the list filter as the search fills in.'
  },
  'quick-look': {
    title: 'The same search, over any app',
    body: 'Press {shortcut} and this box opens on top of whatever you are working in — even while Diff Bro is minimised. Find a snippet, copy it, press Escape. Try it now.'
  },
  'settings-open': {
    title: 'The rest is in the menus',
    body: 'Fourteen themes, size limits, where your data is kept, the shortcut above — all of it is in Settings, at the bottom of the File menu.',
    nextLabel: 'Open Settings'
  },
  'settings-panes': {
    title: 'One pane at a time',
    body: 'Everything else is down this list — Shortcuts for the quick look-up chord, Storage for where your data is kept, Limits for how large a file may be.'
  },
  'settings-tips': {
    title: 'And this is the off switch',
    body: 'Tips appear again after an update. Turn them off here — or press Show tour whenever you want this walk-through back.'
  },
  'snippet-new': {
    title: 'Save commonly used text or code',
    body: 'A deploy payload, a prompt, a config block — the + here starts one, and the search finds it again next week.',
    nextLabel: 'Open the editor'
  },
  'snippet-save': {
    title: 'Name it, tag it, save it',
    body: 'This one is filled in already. Press the ringed Save to keep it — the sidebar and the quick look-up both find it afterwards. Next moves on either way.'
  },
  'snippet-drag': {
    title: 'Drag it anywhere in here',
    body: 'The whole comparison area takes a drop — you don’t have to land on a file box. A snippet can face a file, or another snippet.'
  },
  diagram: {
    title: 'A diagram change, as a diagram',
    body: 'This one is a Mermaid diagram — open it and it draws itself as you type. Compare two versions and every added, removed or changed node is marked on the picture rather than in the text.'
  }
}
