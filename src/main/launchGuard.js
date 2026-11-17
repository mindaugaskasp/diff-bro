const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe']

export const isDebugLaunch = (hasSwitch) => DEBUG_SWITCHES.some((name) => hasSwitch(name))
