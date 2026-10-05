| name | description |
| --- | --- |
| `api-index` | Index of `@rstore/multiplayer` and Nuxt multiplayer API/config/hook references (one file per element) |

# API Index

| API/config/hook element | Reference file |
| --- | --- |
| `createMultiplayerPlugin` | [./api-create-multiplayer-plugin.md](./api-create-multiplayer-plugin.md) |
| `createMultiplayerPlugin({ lww })` | [./api-option-lww.md](./api-option-lww.md) |
| `lww.conflictPolicy` | [./api-option-conflict-policy.md](./api-option-conflict-policy.md) |
| `createMultiplayerPlugin({ tombstoneGc })` | [./api-option-tombstone-gc.md](./api-option-tombstone-gc.md) |
| `createMultiplayerPlugin({ formTextMerge })` | [./api-option-form-text-merge.md](./api-option-form-text-merge.md) |
| `metadata.fieldTimestamps` | [./api-field-timestamps.md](./api-field-timestamps.md) |
| `metadata.deletedAt` | [./api-deleted-at.md](./api-deleted-at.md) |
| `getFieldTimestamps` | [./api-get-field-timestamps.md](./api-get-field-timestamps.md) |
| `setFieldTimestamps` | [./api-set-field-timestamps.md](./api-set-field-timestamps.md) |
| `getTombstone` | [./api-get-tombstone.md](./api-get-tombstone.md) |
| `tombstoneEntries` | [./api-tombstone-entries.md](./api-tombstone-entries.md) |
| `gcTombstones` | [./api-gc-tombstones.md](./api-gc-tombstones.md) |
| `cacheConflict hook` | [./api-cache-conflict.md](./api-cache-conflict.md) |
| `textFieldMerger` | [./api-text-field-merger.md](./api-text-field-merger.md) |
| `@rstore/multiplayer/clock` | [./api-entry-clock.md](./api-entry-clock.md) |
| `@rstore/multiplayer/lww` | [./api-entry-lww.md](./api-entry-lww.md) |
| `@rstore/multiplayer/text` | [./api-entry-text.md](./api-entry-text.md) |
| `@rstore/multiplayer/protocol` | [./api-entry-protocol.md](./api-entry-protocol.md) |
| `parseMultiplayerMessage` | [./api-parse-multiplayer-message.md](./api-parse-multiplayer-message.md) |
| `createPresenceChannel` | [./api-create-presence-channel.md](./api-create-presence-channel.md) |
| `channel.setTextCursor` | [./api-presence-set-text-cursor.md](./api-presence-set-text-cursor.md) |
| `channel.notifyTyping` | [./api-presence-notify-typing.md](./api-presence-notify-typing.md) |
| `channel.clearFocus` | [./api-presence-clear-focus.md](./api-presence-clear-focus.md) |
| `createMultiplayerServer` | [./api-create-multiplayer-server.md](./api-create-multiplayer-server.md) |
| `createMultiplayerServerHooks` | [./api-create-multiplayer-server-hooks.md](./api-create-multiplayer-server-hooks.md) |
| `multiplayer.authorize hook` | [./api-hook-multiplayer-authorize.md](./api-hook-multiplayer-authorize.md) |
| `multiplayer.filter hook` | [./api-hook-multiplayer-filter.md](./api-hook-multiplayer-filter.md) |
| `isOriginAllowed` | [./api-is-origin-allowed.md](./api-is-origin-allowed.md) |
| `@rstore/nuxt-multiplayer module` | [./api-nuxt-multiplayer-module.md](./api-nuxt-multiplayer-module.md) |
| `useRstoreMultiplayerChannel` | [./api-use-rstore-multiplayer-channel.md](./api-use-rstore-multiplayer-channel.md) |
| `useRstoreMultiplayerForm` | [./api-use-rstore-multiplayer-form.md](./api-use-rstore-multiplayer-form.md) |
| `useRstoreMultiplayerField` | [./api-use-rstore-multiplayer-field.md](./api-use-rstore-multiplayer-field.md) |
| `useRstoreMultiplayerTextField` | [./api-use-rstore-multiplayer-text-field.md](./api-use-rstore-multiplayer-text-field.md) |
| `useRstoreMultiplayerTyping` | [./api-use-rstore-multiplayer-typing.md](./api-use-rstore-multiplayer-typing.md) |
| `<RstoreMultiplayerPresenceList>` | [./api-rstore-multiplayer-presence-list.md](./api-rstore-multiplayer-presence-list.md) |
| `<RstoreMultiplayerTextCursorOverlay>` | [./api-rstore-multiplayer-text-cursor-overlay.md](./api-rstore-multiplayer-text-cursor-overlay.md) |
| `@rstore/nuxt-multiplayer-server module` | [./api-nuxt-multiplayer-server-module.md](./api-nuxt-multiplayer-server-module.md) |
| `rstoreMultiplayerServer.endpoint` | [./api-option-endpoint.md](./api-option-endpoint.md) |
| `maxRoomSize` | [./api-option-max-room-size.md](./api-option-max-room-size.md) |
| `maxMessageBytes` | [./api-option-max-message-bytes.md](./api-option-max-message-bytes.md) |
| `rateLimit` | [./api-option-rate-limit.md](./api-option-rate-limit.md) |
| `rstoreMultiplayerServer.allowedOrigins` | [./api-option-allowed-origins.md](./api-option-allowed-origins.md) |
| `rstoreMultiplayerServerHooks` | [./api-rstore-multiplayer-server-hooks.md](./api-rstore-multiplayer-server-hooks.md) |
| `multiplayer-0.9 codemod` | [./api-codemod-multiplayer-0-9.md](./api-codemod-multiplayer-0-9.md) |
| `@rstore/multiplayer/ot` | [./api-entry-ot.md](./api-entry-ot.md) |
| `createCollabClient` | [./api-create-collab-client.md](./api-create-collab-client.md) |
| `createCollabUndoManager` | [./api-create-collab-undo-manager.md](./api-create-collab-undo-manager.md) |
| `createCollabServer` | [./api-create-collab-server.md](./api-create-collab-server.md) |
| `sequenceTransaction` | [./api-sequence-transaction.md](./api-sequence-transaction.md) |
| `OpLogStore` | [./api-op-log-store.md](./api-op-log-store.md) |
| `createMemoryOpLogStore` | [./api-create-memory-op-log-store.md](./api-create-memory-op-log-store.md) |
| `collab redact hook` | [./api-hook-collab-redact.md](./api-hook-collab-redact.md) |
| `createMultiplayerPlugin({ ot })` | [./api-option-ot.md](./api-option-ot.md) |
| `bindCollabCache` | [./api-bind-collab-cache.md](./api-bind-collab-cache.md) |
| `collabPlugin` | [./api-collab-plugin.md](./api-collab-plugin.md) |
| `useRstoreCollabDocument` | [./api-use-rstore-collab-document.md](./api-use-rstore-collab-document.md) |
| `rstoreMultiplayerServer.collab` | [./api-option-collab.md](./api-option-collab.md) |
| `defineRstoreCollab` | [./api-define-rstore-collab.md](./api-define-rstore-collab.md) |
