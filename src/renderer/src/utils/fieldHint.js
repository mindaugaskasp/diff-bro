/**
 * Whether a hint pinned to an input's right end clears the text typed in it.
 * @param {{ typedWidth: number, hintWidth: number, fieldWidth: number, inset: number, gap: number }} m
 */
export const hintFits = ({ typedWidth, hintWidth, fieldWidth, inset, gap }) =>
  inset + typedWidth + gap + hintWidth + inset <= fieldWidth
