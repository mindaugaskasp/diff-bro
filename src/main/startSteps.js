// One step failing must not skip the ones after it: a missing tray icon once took Network sharing down.
export function runSteps(steps, onError) {
  for (const [name, step] of steps) {
    try {
      const result = step()
      if (result && typeof result.catch === 'function') result.catch((err) => onError(name, err))
    } catch (err) {
      onError(name, err)
    }
  }
}
