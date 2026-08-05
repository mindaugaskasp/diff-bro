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
 * @property {boolean} [edited] the app rewrote this copy (Format), so it is no
 *   longer the file on disk — see diffStore._reloadSlot
 * @property {string} [diskContent] what was read before that rewrite, the
 *   baseline the on-focus refresh measures a disk change against
 */

/**
 * One worksheet from a spreadsheet: a dense grid of cell values, plus whatever
 * sparse extras its cells carry. Delimited text (csvAdapter) produces the same
 * shape with no extras.
 * @typedef {object} SheetGrid
 * @property {string} name
 * @property {Array<Array<string|number|boolean|null>>} rows
 * @property {boolean} [hidden]        the workbook hides this sheet
 * @property {number[]} [hiddenRows]   0-based indices of hidden rows
 * @property {Array<[number, number, CellMeta]>} [cells]  sparse [row, col, meta]
 * @property {boolean} [truncated]     the row cap was hit before the end
 */

/**
 * What one cell carries beyond its value. Absent fields mean "nothing to say".
 * @typedef {object} CellMeta
 * @property {string} [f]  formula in A1 notation, without the leading `=`
 * @property {string} [n]  the same formula in R1C1, so position stops mattering
 * @property {string} [d]  what its number format asks to be shown instead
 * @property {true} [e]    the cell holds an error value (#REF!, #DIV/0! …)
 * @property {true} [dt]   the value is a date serial, so no tolerance may touch it
 */

/**
 * What main reports when it opens a streamed comparison: the alignment, the
 * counts, and whether either side outran the index's line cap. `runs` is the
 * flat quintuple encoding from src/main/hashDiff.js.
 * @typedef {object} StreamSummary
 * @property {string} token        handle for the windowed line reads
 * @property {Int32Array} runs
 * @property {number} additions
 * @property {number} deletions
 * @property {boolean} approximate the files differ too widely to align exactly
 * @property {number} leftLines
 * @property {number} rightLines
 * @property {boolean} truncated   the line cap was hit before the end of a file
 * @property {number} maxLines
 */

/**
 * One display row of a streamed comparison (see utils/streamRows.js). A line is
 * null where that side has no counterpart on this row.
 * @typedef {object} StreamRow
 * @property {'same'|'chg'|'del'|'ins'} status
 * @property {number|null} leftLine   0-based
 * @property {number|null} rightLine
 */

/**
 * The comparable produced by xlsxAdapter for the (upcoming) grid viewer.
 * @typedef {object} SpreadsheetComparable
 * @property {'spreadsheet'} kind
 * @property {SheetGrid[]} sheets
 */

/**
 * A whole comparison, detached from the store: what a saved diff decrypts to,
 * what a tab holds while it is not on screen, and what the session restores.
 * @typedef {object} DiffSnapshot
 * @property {'files'|'paste'} mode
 * @property {LoadedFile|null} left
 * @property {LoadedFile|null} right
 * @property {string} pasteLeft
 * @property {string} pasteRight
 * @property {LoadedFile|null} pasteLeftFile   a file dropped on a paste side
 * @property {LoadedFile|null} pasteRightFile
 * @property {string} pasteLeftName   what to call the pasted side ('' = placeholder)
 * @property {string} pasteRightName
 * @property {boolean} renderSideBySide
 * @property {boolean} ignoreTrimWhitespace
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
 * @property {string|null} [format]  compared files' format id (json, yaml, …), for the row's type monogram
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
 * @property {number} createdAt    epoch ms; immutable — it is inside the AAD
 * @property {number} updatedAt    epoch ms of the last edit; plain metadata,
 *                                 NOT in the AAD, so touching it never re-encrypts
 * @property {string} language     'auto', or an explicit Monaco language id
 * @property {string} [detected]   language detected from the content on save
 * @property {string[]} [vars]     {{placeholders}} in a claude prompt, for the fill-on-copy cue
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
 * @property {string} labelKey     tooltip / aria-label
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

/**
 * A rectangle of the renderer's page, in CSS pixels, handed to main so it can
 * screenshot that region (see utils/captureTarget.js).
 * @typedef {object} CaptureRect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * A snippet on the capture stage while its picture is taken (SnippetShot.vue).
 * @typedef {object} SnippetShot
 * @property {string} name
 * @property {string} lang    snippet language id; `mermaid` stages a diagram
 * @property {string} code
 * @property {boolean} ready  the stage has painted — the shutter waits on this
 * @property {boolean} failed the diagram would not render; no picture is taken
 */

/**
 * A diff screenshot main is holding, as previewed by DiffImageDialog.
 * @typedef {object} DiffImageCapture
 * @property {string} dataUrl  PNG data URL, for the preview only
 * @property {number} width    device pixels
 * @property {number} height
 * @property {boolean} [truncated]  the diff outran the export's height ceiling
 */

/**
 * One row of the tab context menu. A separator carries only `sep`; every other
 * item is always present and answers `enabled` instead of being dropped, so the
 * menu's shape does not change with the tab it was opened on.
 * @typedef {object} TabMenuItem
 * @property {import('./utils/tabMenu').TabMenuAction} [action]
 * @property {string} [label]
 * @property {boolean} [enabled]
 * @property {true} [sep]
 */

/**
 * A peer we can seal a diff for, as `share:listTrusted` projects it. Key
 * MATERIAL never crosses the boundary — only the fingerprint that identifies it.
 * The email is a local delivery hint typed by the owner of this machine; it
 * never travels in a `.diffbrokey`, so it is never attacker-supplied on import.
 * @typedef {object} TrustedKey
 * @property {string} fingerprint
 * @property {string} label          the display name the user gave this key
 * @property {string|null} [email]   null when none is set
 */

/**
 * One beat of the onboarding tour. `advance` runs when NEXT is pressed, so the
 * step points at a control and the press performs the action; `enter` is the
 * rare effect that belongs on arrival, and only ever happens INSIDE the ring.
 * @typedef {object} TourStep
 * @property {string} id
 * @property {1|2} run              which launch's block this belongs to
 * @property {string} since         app version that introduced it
 * @property {string} target        a `[data-tour="…"]` selector
 * @property {'top'|'bottom'|'left'|'right'} [side]  preferred callout side
 * @property {string} labelKey
 * @property {string} body          `{shortcut}` / `{settingsKey}` are filled in
 * @property {string} [advance]     command the step's Next runs
 * @property {string} [enter]       command run as the step arrives
 * @property {string} [leave]       command run when the step is left, either way
 * @property {string} [undo]        command Back runs to reverse this step's advance
 * @property {string} [context]     a region the step is ABOUT: stroked, veil softened
 * @property {string} [point]       the control inside a large target the ring belongs on
 * @property {string} [nextLabel]   what the primary says when it does something
 * @property {boolean} [zone]       an area, not a control: dashed, callout inside
 * @property {boolean} [live]       the hole accepts the pointer; blocked by default
 * @property {boolean} [reveal]     drop the veil for a beat before advancing
 */

/**
 * What `tourPlan` needs to decide what plays now.
 * @typedef {object} TourState
 * @property {boolean} showTips
 * @property {number} tourStep      index of the next unseen step
 * @property {string} seenVersion   '' until every run has been walked
 * @property {number} [tourDeferred] how many times "Not now" was chosen
 * @property {TourStep[]} [allSteps] the list to plan over; defaults to TOUR_STEPS
 */

/**
 * A registry tool as the sidebar section draws it — `utils/tools.js` `Tool`
 * plus the pin state `toolRows` resolves for that row.
 * @typedef {object} ToolRow
 * @property {string} id
 * @property {string} name
 * @property {string} icon      an ICONS key (src/renderer/src/icons.js)
 * @property {string} kind      one-word action, shown as the row's trailing meta
 * @property {string} action    menu action that opens it
 * @property {boolean} pinned   heads the list, and marks itself
 */

export {}
