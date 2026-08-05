// What a streamed comparison cannot do, and why — in terms of the consequence
// the user can see, not the mechanism. One source for the disabled tooltips and
// the notices, so a control and its refusal never say different things.
//
// KEYS, resolved at each use. Translating here would run once at module load and
// freeze whatever locale the app started in.
export const STREAMED_LIMITS = {
  save: 'diffNotices.tooLargeToSaveA',
  share: 'diffNotices.tooLargeToShareA',
  copy: 'diffNotices.tooLargeToCopyAs',
  exportHtml: 'diffNotices.tooLargeToExportAn'
}
