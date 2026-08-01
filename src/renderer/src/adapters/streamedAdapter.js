// A file too large to hold. Main hands back a descriptor instead of text (see
// files.js STREAM_THRESHOLD_BYTES), so the comparable carries the PATH the
// streamed viewer reads windows from — there is no `text` here, and anything
// that needs the whole document has to gate on this kind.
export const streamedAdapter = {
  id: 'streamed',
  matches: (file) => file?.kind === 'streamed',
  toComparable(file) {
    return { kind: 'streamed', path: file.path, name: file.name, size: file.size ?? 0 }
  }
}
