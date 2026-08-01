// @ts-expect-error virtual module populated by the module's addTemplate call
import { allowedOrigins, maxMessageBytes, maxRoomSize, rateLimit } from '#build/$rstore-multiplayer-server-config.js'
import { createMultiplayerWebSocketHandler } from './ws-handler'

export default createMultiplayerWebSocketHandler({
  maxRoomSize,
  maxMessageBytes,
  rateLimit,
  allowedOrigins,
})
