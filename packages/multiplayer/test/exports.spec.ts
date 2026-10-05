import * as root from '@rstore/multiplayer'
import * as clock from '@rstore/multiplayer/clock'
import * as lww from '@rstore/multiplayer/lww'
import * as ot from '@rstore/multiplayer/ot'
import * as presence from '@rstore/multiplayer/presence'
import * as prosemirror from '@rstore/multiplayer/prosemirror'
import * as protocol from '@rstore/multiplayer/protocol'
import * as server from '@rstore/multiplayer/server'
import * as text from '@rstore/multiplayer/text'
import { describe, expect, it } from 'vitest'

/** Runtime names each public entry must expose, from the multiplayer inventory. */
const expectedExports = {
  'clock': [
    'DEFAULT_MAX_CLOCK_SKEW_MS',
    'HLCClockSkewError',
    'HybridLogicalClock',
    'compareHLC',
    'createHLCClock',
    'createNodeId',
    'getDefaultClock',
    'parseHLC',
    'setDefaultClock',
    'stringifyHLC',
  ],
  'lww': [
    'applyConflictPolicy',
    'createFieldTimestamps',
    'createTombstoneStore',
    'gcTombstones',
    'isTombstone',
    'maxStamp',
    'mergeItemFields',
    'scheduleTombstoneGc',
    'shouldResurrect',
    'tombstoneKey',
    'touchFields',
  ],
  'text': [
    'applyTextChanges',
    'diffText',
    'mergeText',
    'rebaseTextPosition',
    'rebaseTextRange',
  ],
  'presence': [
    'DEFAULT_MULTIPLAYER_COLORS',
    'areMultiplayerTextCursorsEqual',
    'createMultiplayerUser',
    'createPresenceChannel',
    'isMultiplayerPeerStrict',
    'isSameTypingTarget',
    'rebaseMultiplayerTextCursor',
  ],
  'protocol': [
    'isMultiplayerId',
    'isMultiplayerMessage',
    'isMultiplayerTextCursor',
    'isMultiplayerUser',
    'parseMultiplayerMessage',
    'sanitizeMultiplayerUpdate',
    // `collab:*` frames (X1)
    'COLLAB_PROTOCOL_VERSION',
    'SUPPORTED_COLLAB_PROTOCOLS',
    'isCollabClientMessage',
    'isCollabServerMessage',
    'isDocTransaction',
    'negotiateCollabProtocol',
    'parseCollabMessage',
    // Protocol 2 channel frames (X2)
    'fromChannelFrame',
    'toChannelFrame',
    'toChannelSubmit',
  ],
  // Rich-text OT (X1, experimental)
  'ot': [
    'OtTransformConflict',
    'OtValidationError',
    'applyDocOps',
    'applyTextOp',
    'cloneDocState',
    'clearPendingState',
    'compareSiblings',
    'composeDocOps',
    'composeTextOps',
    'concatDelta',
    'createCollabClient',
    'createCollabUndoManager',
    'createCompositionGuard',
    'createDocState',
    'defaultMarkExpandPolicy',
    'deltaLength',
    'deltaToPlainText',
    'diffDelta',
    'diffPlainText',
    'generateOrderKey',
    'generateOrderKeys',
    'insertNodeOp',
    'invertDocOps',
    'invertTextOp',
    'isNodeVisible',
    'isValidOrderKey',
    'loadPendingState',
    'mergeNodeOp',
    'moveNodeOp',
    'normalizeDelta',
    'normalizeTextOp',
    'orderedChildren',
    'rebaseDocOps',
    'rebaseOnSnapshot',
    'savePendingState',
    'sliceDelta',
    'splitNodeOp',
    'transformDocOps',
    'transformTextOp',
    'transformTextPosition',
  ],
  'prosemirror': [
    'NODE_ID_ATTR',
    'attributesToMarks',
    'collabPlugin',
    'collabPluginKey',
    'collabRedo',
    'collabUndo',
    'deltaToInline',
    'diffDocument',
    'docStateToNode',
    'flattenBlocks',
    'marksToAttributes',
    'rebuildTransaction',
    'remoteTransaction',
    'textblockToDelta',
    'withNodeIds',
  ],
  'server': [
    // Room server (S6)
    'PeerIdentityStore',
    'PeerRateLimiter',
    'Room',
    'RoomRegistry',
    'createMultiplayerServer',
    'createMultiplayerServerHooks',
    'isOriginAllowed',
    // Rich-text OT sequencer (X1), op log retention (X2)
    'DEFAULT_OP_LOG_RETENTION',
    'OpLogAppendRejected',
    'compactionFloor',
    'createCollabServer',
    'createMemoryOpLogStore',
    'rebaseTransaction',
    'sequenceTransaction',
  ],
  '.': [
    'FIELD_TIMESTAMPS_NAMESPACE',
    'OT_NAMESPACE',
    'TOMBSTONE_NAMESPACE',
    'bindCollabCache',
    'createMultiplayerPlugin',
    'gcTombstones',
    'getFieldTimestamps',
    'getTombstone',
    'setFieldTimestamps',
    'textFieldMerger',
    'tombstoneEntries',
  ],
} satisfies Record<string, string[]>

const modules: Record<keyof typeof expectedExports, Record<string, unknown>> = {
  'clock': clock,
  'lww': lww,
  'text': text,
  'presence': presence,
  'protocol': protocol,
  'ot': ot,
  'prosemirror': prosemirror,
  'server': server,
  '.': root,
}

describe('@rstore/multiplayer public entries', () => {
  it.each(Object.keys(expectedExports) as Array<keyof typeof expectedExports>)('exports exactly the expected names from %s', (entry) => {
    expect(Object.keys(modules[entry]).sort()).toEqual([...expectedExports[entry]].sort())
  })
})
