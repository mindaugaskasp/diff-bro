// Closing cancels a save still pending from the last move, which would otherwise fire on a destroyed window.
export function createStateSaver({ snapshot, write, isGone, delayMs = 500 }) {
  let timer = null
  const save = () => {
    if (!isGone()) write(snapshot())
  }
  return {
    soon() {
      clearTimeout(timer)
      timer = setTimeout(save, delayMs)
    },
    now() {
      clearTimeout(timer)
      timer = null
      save()
    }
  }
}
