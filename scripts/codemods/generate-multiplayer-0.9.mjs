import { writeFileSync } from 'node:fs'
/**
 * Writes `multiplayer-0.9.yml`, the ast-grep codemod of the @rstore/multiplayer
 * move. The rules repeat the moved name lists many times, so they are
 * generated from the lists below (kept equal to the deprecated re-exports of
 * `@rstore/core` and the 0.9 type sources of `@rstore/shared`; a test checks
 * the file is up to date).
 *
 *   node scripts/codemods/generate-multiplayer-0.9.mjs
 */
import process from 'node:process'

/** Names re-exported by `@rstore/core` (deprecated) per destination subpath. */
export const coreMoves = [
  ['clock', '@rstore/multiplayer/clock', ['DEFAULT_MAX_CLOCK_SKEW_MS', 'HLCClockSkewError', 'HybridLogicalClock', 'compareHLC', 'createHLCClock', 'getDefaultClock', 'parseHLC', 'setDefaultClock', 'stringifyHLC', 'FieldTimestampValue', 'HLCClockSkewInfo', 'HLCString', 'HLCTimestamp', 'HybridLogicalClockOptions']],
  ['lww', '@rstore/multiplayer/lww', ['createFieldTimestamps', 'createTombstoneStore', 'gcTombstones', 'isTombstone', 'mergeItemFields', 'scheduleTombstoneGc', 'shouldResurrect', 'tombstoneKey', 'touchFields', 'FieldConflict', 'FieldTimestamps', 'ScheduleTombstoneGcOptions', 'Tombstone', 'TombstoneGcSweepInfo', 'TombstoneStore', 'MergeResult']],
  ['text', '@rstore/multiplayer/text', ['applyTextChanges', 'diffText', 'mergeText', 'rebaseTextPosition', 'rebaseTextRange', 'MergeTextOptions', 'RebaseTextRangeOptions', 'TextChange', 'TextMergeConflict', 'TextMergeResult', 'TextPositionAffinity', 'TextRange']],
]

/** Types still defined by `@rstore/shared` in 0.9, re-exported by `@rstore/multiplayer`. */
export const sharedTypeMoves = [
  ['multiplayer', '@rstore/multiplayer', ['FieldTimestampValue', 'FieldTimestamps', 'FieldConflict', 'MergeResult', 'TextChange', 'TextMergeConflict', 'TextMergeResult', 'Multiplayer[A-Za-z]+']],
]

/** Protocol guards that left `@rstore/shared`. */
export const sharedValueMoves = [
  ['protocol', '@rstore/multiplayer/protocol', ['isMultiplayerId', 'isMultiplayerMessage', 'isMultiplayerTextCursor', 'isMultiplayerUser', 'parseMultiplayerMessage']],
]

/** `^(a|b)$` for a name list. */
function names(list) {
  return `'^(${list.join('|')})$'`
}

/**
 * Two rules for one moved import source: imports keeping some names (rewritten
 * to the kept import plus one import per moved name) and imports moving every
 * name (no empty import left behind).
 */
function importRules(id, source, keyword, moves, message) {
  const moved = names(moves.flatMap(([, , list]) => list))
  const toRewriters = moves.flatMap(([group, dest, list]) => [
    `  - id: to-${group}
    rule:
      kind: import_specifier
      has: { field: name, regex: ${names(list)}, pattern: $N }
      not: { has: { field: alias, kind: identifier } }
    fix: "\\n${keyword} { $N } from '${dest}'"`,
    `  - id: to-${group}-aliased
    rule:
      kind: import_specifier
      all:
        - has: { field: name, regex: ${names(list)}, pattern: $N }
        - has: { field: alias, kind: identifier, pattern: $A }
    fix: "\\n${keyword} { $N as $A } from '${dest}'"`,
  ])
  const rewriters = [...toRewriters, `  - id: drop
    rule:
      kind: import_specifier
    fix: ''
  - id: drop-moved
    rule:
      kind: import_specifier
      has: { field: name, regex: ${moved} }
    fix: ''
  - id: keep-aliased
    rule:
      kind: import_specifier
      all:
        - has: { field: name, pattern: $N }
        - has: { field: alias, kind: identifier, pattern: $A }
    fix: '$N as $A, '
  - id: keep
    rule:
      kind: import_specifier
      has: { field: name, pattern: $N }
    fix: '$N, '`].join('\n')
  const movedRewriters = [...moves.flatMap(([group]) => [`to-${group}`, `to-${group}-aliased`]), 'drop'].join(', ')
  const keptSpecifier = `{ stopBy: end, kind: import_specifier, not: { has: { field: name, regex: ${moved} } } }`
  return ['mixed', 'all'].map(mode => `id: ${id}-${mode}
language: TypeScript
severity: warning
message: ${message}
rule:
  kind: import_statement
  pattern: ${keyword} { $$$SPECS } from $SRC
  all:
    - has: { stopBy: end, kind: import_specifier, has: { field: name, regex: ${moved} } }
    - ${mode === 'mixed' ? `has: ${keptSpecifier}` : `not: { has: ${keptSpecifier} }`}
constraints:
  SRC:
    regex: "^['\\"]${source}['\\"]$"
rewriters:
${rewriters}
transform:
  MOVED:
    rewrite:
      source: $$$SPECS
      rewriters: [${movedRewriters}]
      joinBy: ''
  KEPT:
    rewrite:
      source: $$$SPECS
      rewriters: [drop-moved, keep-aliased, keep]
      joinBy: ''
  FIRST:
    substring:
      source: $MOVED
      startChar: 1
fix: '${mode === 'mixed' ? `${keyword} { $KEPT} from $SRC$MOVED` : '$FIRST'}'
`)
}

/** Rules moving an option of cache calls (`key: value` and shorthand) under `metadata`. */
function metadataOptionRules(id, key, calls) {
  const message = `'\`${key}\` is now passed as \`metadata: { ${key} }\`'`
  const call = `kind: call_expression
            has: { field: function, regex: '(^|\\.)(${calls})$' }`
  return [`id: ${id}
language: TypeScript
severity: warning
message: ${message}
rule:
  kind: pair
  has: { field: key, regex: '^${key}$' }
  all:
    - has: { field: value, pattern: $V }
    - inside:
        kind: object
        inside:
          kind: arguments
          inside:
            ${call}
fix: 'metadata: { ${key}: $V }'
`, `id: ${id}-shorthand
language: TypeScript
severity: warning
message: ${message}
rule:
  kind: shorthand_property_identifier
  regex: '^${key}$'
  inside:
    kind: object
    inside:
      kind: arguments
      inside:
        ${call.replace(/\n {12}/, '\n        ')}
fix: 'metadata: { ${key} }'
`]
}

const tombstoneGcRule = `id: rstore-create-store-tombstone-gc
language: TypeScript
severity: warning
message: 'createStore({ tombstoneGc }) moved to createMultiplayerPlugin({ tombstoneGc }) from @rstore/multiplayer'
rule:
  kind: pair
  has: { field: key, regex: '^tombstoneGc$' }
  all:
    - has: { field: value, pattern: $V }
    - inside:
        kind: object
        inside:
          kind: arguments
          inside:
            kind: call_expression
            has: { field: function, regex: '(^|\\.)createStore$' }
fix:
  template: '/* TODO(rstore 0.9): pass tombstoneGc: $V to createMultiplayerPlugin() */'
  expandEnd: { regex: ',' }
`

const formConflictRule = `id: rstore-form-conflict-timestamps
language: TypeScript
severity: warning
message: 'If this reads a form \`$conflicts\` entry: localTimestamp/remoteTimestamp were removed (FormFieldConflict is { field, localValue, remoteValue }). cacheConflict entries keep them.'
rule:
  kind: property_identifier
  regex: '^(localTimestamp|remoteTimestamp)$'
  inside:
    kind: member_expression
`

/** Content of `multiplayer-0.9.yml`. */
export function generateMultiplayerCodemod() {
  const coreMessage = 'Clock, LWW, text and tombstone helpers moved from @rstore/core to @rstore/multiplayer'
  const rules = [
    ...importRules('rstore-core-import', '@rstore/core', 'import', coreMoves, coreMessage),
    ...importRules('rstore-core-import-type', '@rstore/core', 'import type', coreMoves, coreMessage),
    ...importRules('rstore-shared-import-type', '@rstore/shared', 'import type', sharedTypeMoves, 'LWW, text and protocol types moved from @rstore/shared to @rstore/multiplayer'),
    ...importRules('rstore-shared-import', '@rstore/shared', 'import', sharedValueMoves, 'Multiplayer protocol guards moved from @rstore/shared to @rstore/multiplayer/protocol'),
    ...metadataOptionRules('rstore-write-field-timestamps', 'fieldTimestamps', 'writeItem|applyMutation'),
    ...metadataOptionRules('rstore-delete-deleted-at', 'deletedAt', 'deleteItem|applyMutation'),
    tombstoneGcRule,
    formConflictRule,
  ]
  return `# Generated by generate-multiplayer-0.9.mjs: edit the generator, not this file.
#
# Codemod for the @rstore/multiplayer move (rstore 0.9):
#
#   pnpm dlx @ast-grep/cli scan -r scripts/codemods/multiplayer-0.9.yml --update-all <dir>
#
# Then run your formatter (e.g. \`eslint --fix\`): moved names get one import
# statement each, and kept specifiers keep a trailing comma.
${rules.join('---\n')}`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL('./multiplayer-0.9.yml', import.meta.url), generateMultiplayerCodemod())
}
