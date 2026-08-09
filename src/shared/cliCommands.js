// Every `diffbro` subcommand, in one list so `help` can never drift from what
// parseCli actually accepts — and so the Settings pane that documents them
// cannot drift from either. Shared because BOTH sides render it: main prints it
// to a terminal, the renderer shows it under Terminal.
//
// `usage` is SYNTAX and stays untranslated, like the Jira and Markdown
// toolbars' examples. The prose is a catalogue key each side resolves with its
// own t(): a string baked in here would freeze whatever locale started the app.
// The keys are LITERAL so check:i18n can see the call sites.
export const COMMANDS = [
  {
    topic: 'compare',
    usage: 'diffbro compare <file> [<file>]',
    summaryKey: 'cli.compare.summary',
    detailKey: 'cli.compare.detail'
  },
  {
    topic: 'difftool',
    usage: 'diffbro difftool <file> <file>',
    summaryKey: 'cli.difftool.summary',
    detailKey: 'cli.difftool.detail'
  },
  {
    topic: 'mergetool',
    usage: 'diffbro mergetool <local> <remote> <merged>',
    summaryKey: 'cli.mergetool.summary',
    detailKey: 'cli.mergetool.detail'
  },
  {
    topic: 'open',
    usage: 'diffbro open [<file>]',
    summaryKey: 'cli.open.summary',
    detailKey: 'cli.open.detail'
  },
  {
    topic: 'backup',
    usage: 'diffbro backup <path>',
    summaryKey: 'cli.backup.summary',
    detailKey: 'cli.backup.detail'
  },
  {
    topic: 'create',
    usage: 'diffbro create snippet [--interactive]',
    summaryKey: 'cli.create.summary',
    detailKey: 'cli.create.detail'
  },
  {
    topic: 'clipboard',
    usage: 'diffbro clipboard save',
    summaryKey: 'cli.clipboard.summary',
    detailKey: 'cli.clipboard.detail'
  },
  {
    topic: 'help',
    usage: 'diffbro help [<command>]',
    summaryKey: 'cli.help.summary',
    detailKey: 'cli.help.detail'
  }
]
