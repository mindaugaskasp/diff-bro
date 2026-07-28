// The shapes that cross a boundary in the renderer — component props, composable
// returns, IPC results. JSDoc rather than TypeScript: no build step, no new
// dependency, and editors still complete and check the fields.
//
// A prop typed `Object` documents nothing, so anything shared between files
// gets a typedef here and a `@type {import('../types').X}` on the prop.

/**
 * A file loaded into one side of the comparison. Text files carry `content`;
 * spreadsheets (parsed in the main process) carry `kind:'spreadsheet'` + `sheets`
 * instead — the adapter registry keys off that (see adapters/).
 * @typedef {object} LoadedFile
 * @property {string} path      absolute path it was read from
 * @property {string} name      basename, shown in the slot
 * @property {string} [content] decoded text (text files; absent for spreadsheets)
 * @property {'spreadsheet'} [kind]  non-text format, set by main
 * @property {SheetGrid[]} [sheets]  parsed worksheets when kind === 'spreadsheet'
 * @property {string} [encoding]
 * @property {number} [size]    bytes on disk
 */

/**
 * One worksheet from a spreadsheet: a dense grid of cell values.
 * @typedef {object} SheetGrid
 * @property {string} name
 * @property {Array<Array<string|number|boolean|null>>} rows
 */

/**
 * The comparable produced by xlsxAdapter for the (upcoming) grid viewer.
 * @typedef {object} SpreadsheetComparable
 * @property {'spreadsheet'} kind
 * @property {SheetGrid[]} sheets
 */

/**
 * A saved diff, as stored in the vault (content encrypted at rest).
 * @typedef {object} VaultEntry
 * @property {string} id
 * @property {string} name
 * @property {number} createdAt   epoch ms
 * @property {number} expiresAt   epoch ms; purged on tick() once passed
 * @property {string|null} from   sender's label when shared in, else null
 * @property {string} categoryId
 * @property {boolean} favorite
 * @property {string} iv          base64 GCM nonce
 * @property {string} data        base64 ciphertext
 */

/**
 * A snippet, as stored in the snippet library (content encrypted at rest).
 * @typedef {object} SnippetEntry
 * @property {string} id
 * @property {string} aadSalt      immutable; binds the ciphertext to this entry
 * @property {string} name
 * @property {number} createdAt    epoch ms
 * @property {string} language     'auto', or an explicit Monaco language id
 * @property {string} [detected]   language detected from the content on save
 * @property {boolean} favorite
 * @property {string[]} tags       up to MAX_TAGS names; empty means Default
 * @property {string} iv
 * @property {string} data
 */

/**
 * One chip in the snippets tag filter bar.
 * @typedef {object} TagChip
 * @property {string} name          tag name, or the DEFAULT_TAG sentinel
 * @property {string} label         what the chip reads
 * @property {string|null} color    null for the Default catch-all
 * @property {number} count         snippets carrying it
 */

/**
 * The decrypted hover preview of a snippet (see useSnippetPreview).
 * @typedef {object} SnippetPreview
 * @property {string} id
 * @property {string} name
 * @property {string[]} tags
 * @property {string} lang                 '' when it's plain text
 * @property {string} text                 truncated plaintext
 * @property {{left: string, top: string}} style  fixed-position placement
 */

/**
 * A snippet or saved diff normalized into one searchable shape for the quick
 * look-up (see utils/quickLook and composables/useQuickLook).
 * @typedef {object} QuickLookItem
 * @property {'snippet'|'diff'} kind
 * @property {string} id
 * @property {string} name
 * @property {string[]} tags
 * @property {string} lang                 resolved language id ('' for plain)
 */

/**
 * A remembered dialog panel size in px (see BaseDialog's resizable dialogs).
 * @typedef {object} DialogSize
 * @property {number} width
 * @property {number} height
 */

/**
 * An inline node in a parsed Jira/Confluence document (see utils/jiraRender).
 * @typedef {object} JiraInlineNode
 * @property {'text'|'strong'|'em'|'ins'|'del'|'code'|'link'} type
 * @property {string} [value]              text / inline-code / (unused) content
 * @property {JiraInlineNode[]} [inlines]  children for emphasis nodes
 * @property {string} [label]              link text
 * @property {string} [href]               link target
 */

/**
 * A block node in a parsed Jira/Confluence document (see utils/jiraRender).
 * @typedef {object} JiraBlock
 * @property {'heading'|'paragraph'|'list'|'quote'|'code'} type
 * @property {number} [level]              heading level 1–6
 * @property {JiraInlineNode[]} [inlines]  heading text
 * @property {JiraInlineNode[][]} [lines]  paragraph lines, each a run of inlines
 * @property {boolean} [ordered]           numbered vs bulleted list
 * @property {{depth: number, inlines: JiraInlineNode[]}[]} [items]  list items
 * @property {JiraBlock[]} [children]      quote body blocks
 * @property {string} [code]               code-block text
 */

/**
 * A formatting-toolbar button (see jiraMarkup / markdownMarkup, FormatToolbar).
 * @typedef {object} MarkupAction
 * @property {string} id        action id passed to the language's apply*Action
 * @property {string} title     tooltip / aria-label
 * @property {string} [icon]    AppIcon name (icon buttons)
 * @property {string} [text]    short label instead of an icon (e.g. "H1")
 */

/**
 * The tag-chips field's public surface (see useTagInput).
 * @typedef {object} TagField
 * @property {string[]} tags
 * @property {string} input
 * @property {HTMLInputElement|null} inputEl
 * @property {boolean} canAddMore
 * @property {string[]} suggestions
 * @property {(t: string) => string} colorFor
 * @property {(raw: string) => void} add
 * @property {(t: string) => void} remove
 * @property {(e: KeyboardEvent) => void} onKey
 * @property {() => void} onBlur
 * @property {() => Record<string, string>} newColors
 */

/**
 * A format/validate tool descriptor (see utils/textTools.js).
 * @typedef {object} TextTool
 * @property {string} title
 * @property {string} language          Monaco language id
 * @property {(text: string) => ValidationResult} validate
 * @property {(text: string) => string} format
 * @property {string} validLabel        status line when the input parses
 * @property {boolean} requiresValid    Format needs parseable input
 * @property {string} [actionLabel]     primary action label (default 'Format')
 * @property {string} [note]            caveat shown above the actions
 */

/**
 * What a validator reports about a piece of text.
 * @typedef {object} ValidationResult
 * @property {boolean} valid
 * @property {string} [error]
 * @property {number} [line]    1-based, when the parser could locate it
 * @property {number} [column]
 */

/**
 * A viewport-space rectangle in CSS pixels (the Mermaid viewer panel).
 * @typedef {object} Rect
 * @property {number} left
 * @property {number} top
 * @property {number} width
 * @property {number} height
 */

export {}
