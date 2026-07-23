// Registers a Monaco language for Mermaid so snippet code highlights instead of
// rendering as flat plaintext. Monaco ships no Mermaid grammar, so this is a
// Monarch tokenizer — pragmatic, not a full parser: it colours the things that
// carry meaning at a glance (diagram type, structural keywords, links, node
// text, strings, comments) and lets the active vs / vs-dark theme map those
// token types to colours, so it tracks the app's light/dark switch for free.
import { MERMAID_KEYWORDS } from './utils/mermaid'

// Structural words shared across diagram types. Not exhaustive — the ones a
// reader scans for when reading a diagram.
const STRUCTURE = [
  'subgraph',
  'end',
  'direction',
  'participant',
  'actor',
  'note',
  'over',
  'left',
  'right',
  'of',
  'loop',
  'alt',
  'opt',
  'par',
  'and',
  'else',
  'rect',
  'critical',
  'break',
  'activate',
  'deactivate',
  'class',
  'state',
  'title',
  'section',
  'click',
  'call',
  'link',
  'style',
  'classDef',
  'linkStyle',
  'accTitle',
  'accDescr'
]

const DIRECTIONS = ['TB', 'TD', 'BT', 'RL', 'LR']

export function registerMermaidLanguage(monaco) {
  if (monaco.languages.getLanguages().some((l) => l.id === 'mermaid')) return
  monaco.languages.register({ id: 'mermaid' })

  monaco.languages.setLanguageConfiguration('mermaid', {
    comments: { lineComment: '%%' },
    brackets: [
      ['[', ']'],
      ['(', ')'],
      ['{', '}']
    ],
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '{', close: '}' },
      { open: '"', close: '"' }
    ],
    surroundingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '{', close: '}' },
      { open: '"', close: '"' }
    ]
  })

  monaco.languages.setMonarchTokensProvider('mermaid', {
    defaultToken: '',
    keywords: MERMAID_KEYWORDS,
    structure: STRUCTURE,
    directions: DIRECTIONS,
    tokenizer: {
      root: [
        // %%{ init: … }%% configuration directive.
        [/%%\{/, 'annotation', '@directive'],
        // Line comment.
        [/%%.*$/, 'comment'],

        [/"/, 'string', '@dstring'],
        [/'/, 'string', '@sstring'],

        // Edge label between pipes: A -->|yes| B
        [/\|[^|]*\|/, 'string'],

        // Links / arrows: --> --- -.-> ==> --x o--o etc. Longest-first via the
        // {2,} runs; leading/trailing head decorations are optional.
        [/[<xo]?(?:-{2,}|={2,}|-\.-+|-\.|~{3,})[>xo]?/, 'operator'],

        // Node shapes open a text run coloured as a string, so labels read
        // distinctly from ids.
        [/[[({]/, { token: '@brackets', next: '@nodeText' }],
        [/[\])}]/, '@brackets'],

        [/\d+(\.\d+)?/, 'number'],
        [/:::|[;,:&]/, 'delimiter'],

        [
          /[A-Za-z_][\w-]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@structure': 'type',
              '@directions': 'constant',
              '@default': 'identifier'
            }
          }
        ]
      ],

      // Text inside a node shape. Nested openers keep the depth so the matching
      // closer returns to root, not one level too early.
      nodeText: [
        [/[[({]/, '@brackets', '@nodeText'],
        [/[\])}]/, '@brackets', '@pop'],
        [/"/, 'string', '@dstring'],
        [/[^[\](){}"]+/, 'string']
      ],

      directive: [
        [/\}%%/, 'annotation', '@pop'],
        [/[^}]+/, 'annotation'],
        [/\}/, 'annotation']
      ],

      dstring: [
        [/[^"]+/, 'string'],
        [/"/, 'string', '@pop']
      ],
      sstring: [
        [/[^']+/, 'string'],
        [/'/, 'string', '@pop']
      ]
    }
  })
}
