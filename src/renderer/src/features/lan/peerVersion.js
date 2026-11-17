import { LAN_PROTOCOL_VERSION } from '../../../../shared/lanProtocol'

export const needsUpdate = (peer) => (peer.version ?? 1) < LAN_PROTOCOL_VERSION
