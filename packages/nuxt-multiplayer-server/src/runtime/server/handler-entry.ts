// @ts-expect-error Nitro virtual module populated by the module's addServerTemplate call
import { allowedOrigins, collab, maxMessageBytes, maxRoomSize, rateLimit } from '$rstore-multiplayer-server-config.js'
import { createMultiplayerWebSocketHandler } from './ws-handler'

export default createMultiplayerWebSocketHandler({
  maxRoomSize,
  maxMessageBytes,
  rateLimit,
  allowedOrigins,
  collab,
})
