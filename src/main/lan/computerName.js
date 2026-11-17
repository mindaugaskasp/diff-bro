// macOS keeps the friendly name ("Jonas's MacBook Pro") only in ComputerName;
// hostname() there is the dashed DNS label.
export async function readComputerName({ platform, env, hostname, run }) {
  if (platform === 'darwin') {
    try {
      const out = (await run('/usr/sbin/scutil', ['--get', 'ComputerName'])).trim()
      if (out) return out
    } catch {
      return hostname()
    }
  }
  if (platform === 'win32' && env.COMPUTERNAME) return env.COMPUTERNAME
  return hostname()
}
