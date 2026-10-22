# S15: MCP tools and standalone CLI

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S06, S08, S12, S14.
- Owner: agent surface and runnable CLI.
- Contract: [overview](./00-overview.md).

## Outcome

Real MCP clients inspect and mutate explicitly connected producers through same schemas, target checks, and executor as UI. Standalone CLI hosts relay/inspector; stdio bridge connects to running relay.

## Files

- Create `packages/devtools/src/agent/catalog.ts`, `metadata.ts`.
- Create `src/cli/index.ts`, `options.ts`, `stdio.ts`, `shutdown.ts`.
- Extend Devframe definition public handlers with agent metadata; keep private handlers hidden.
- Add package binary `rstore-devtools` pointing at executable ESM output.
- Create `packages/devtools/test/mcp.spec.ts`, `test/cli.spec.ts`.
- Reuse S08 allocated-port relay utility; add one shared real MCP client fixture.

Use pinned `devframe/adapters/cac`, `devframe/adapters/mcp`, and paired `@devframes/agentic` interfaces. No independent MCP JSON-RPC implementation.

## Agent catalog

Expose only overview's public read/action handlers. RPC IDs remain stable `rstore:*`. Devframe 1.2.2 normalizes MCP names through `toAgentToolName`: colon becomes underscore and hyphens remain, for example `rstore:get-cache` becomes `rstore_get-cache`. `src/agent/catalog.ts` owns mapping; SDK calls wrap single RPC argument under `arg0` as required by upstream generated schemas.

Descriptions state exact target, snapshot/live distinction, bounds, and mutation scope. Tool schemas share S01 Valibot source; no handwritten JSON schema diverging from UI/RPC inputs.

Read handlers use Devframe `query` type and `agent.safety: 'read'`. Mutation handlers use RPC `action` type. Non-destructive create/update/write actions use agent safety `action`; clear/delete actions use `destructive`. Devframe 1.2.2 does not accept RPC `type: 'destructive'`.

Annotate mutation tools with readOnly/destructive/idempotent behavior truthfully. Deduplication within five-minute registration window is not durable idempotency across restart. Do not label general create tool unconditionally idempotent.

Internal producer register/publish/dispatch and SSR credential functions never appear in tool list. Module inspection exposes callable metadata only; no module invocation tool.

MCP arguments require full target and command envelope for actions. Backend errors and unknown outcomes return structured bounded action result/error rather than successful empty object.

## HTTP MCP

CLI dev server and Vite/Nuxt host expose Streamable HTTP MCP through official adapter at actual Devframe base route. Do not guess endpoint from prose; use adapter connection metadata and include resolved URL in startup hint.

Because catalog contains data actions, require `DEVFRAME_MCP_AUTH_TOKEN` for HTTP MCP. Without token, disable HTTP MCP route and print one concise setup hint; inspector/producer relay can still start. Flag cannot force unauthenticated write endpoint. With token, bearer validation applies to every MCP request/session as adapter supports.

Keep MCP bearer distinct from browser/Node producer roles and private SSR credential. HTTP client with MCP bearer can invoke public tools, never register producer. Token absent from logs, command echoes, errors, discovery DTOs, and screenshots.

## CLI commands

Use `createCac(definition, options)` for Devframe CLI assembly. Preserve official options for host/port/base and add rstore-specific flags through supported configure hook.

Supported contracts:

- `rstore-devtools dev`: loopback relay plus inspector, waits for connected producers; no store factory imports.
- `rstore-devtools mcp --connect <relay-base-url>`: stdio MCP connected to existing relay, public tools forwarding to exact relay registry.
- `rstore-devtools --help`: accurate supported commands/auth/setup.
- Static `build` report is deferred; hide if adapter permits, otherwise reject with explicit unsupported error and nonzero exit. Never generate successful empty report.

For stdio mode, construct forwarding Devframe definition whose public handlers call running relay through official Node RPC client. Reuse schemas/catalog/target checks. One connection owned by bridge; require explicit producer-independent viewer/tool credential from environment or options. Parent process ownership covers stdio transport; remote relay still enforces its own client auth.

Official CAC built-in `mcp` starts supplied definition, which otherwise has empty local producer registry. Configure/replace command action using supported CAC handle so `--connect` creates forwarding definition before stdio server starts. Verify actual adapter behavior; do not ship stdio tool list that always returns empty sessions despite connected relay.

Stdio stdout contains protocol only. Diagnostics use stderr. Missing/invalid `--connect` fails clearly before claiming tool availability. No subprocess app factories, arbitrary imports, executable config, or autoloaded stores.

## Shutdown and packaging

CLI handles SIGINT/SIGTERM, closes MCP transport, relay/client sockets, timers, and server once. Async cleanup has bounded timeout then exits with accurate status. Existing test process-group utility handles spawned CLI tests.

Publish binary shebang and executable mode, ESM imports, Node >=26 engine, client assets, and optional peer metadata. Node entry does not import inspector Vue bundle. Default standalone base `/`; hosted integrations keep `/__rstore/`.

## Tests first

Use actual MCP SDK client and real local producer:

- Tool list includes all public reads/actions and excludes internal/module-call functions.
- Real direct Core Node producer reads through MCP and cache/CRUD mutations reach actual store/connector once.
- HTTP no-token route unavailable; missing/wrong bearer rejects; correct bearer works.
- MCP bearer cannot impersonate producer or access private SSR publication.
- SSR/readOnly/stale target mutations fail before method call.
- Duplicate command uses shared dedup; timeout does not auto-retry.
- StdIO spawned binary connects to existing relay and reads/mutates producer; stdout remains valid protocol.
- Default dev binary hosts inspector at allocated port/custom base.
- Help/build behavior truthfully reflects deferred reports.
- Shutdown leaves no owned processes/socket/timers.
- Packed binary runs outside workspace dependency resolution.

Do not replace MCP client with direct handler calls as acceptance. Run focused tests serially; capture exact transport/tool/action evidence without secrets.

## Exit gate

HTTP and stdio MCP clients use real connected producers; mutations, auth, read-only, and shutdown proven. Packaged CLI runs independently and never pretends static reports are supported.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: `src/agent/catalog.ts`, `metadata.ts`; `src/cli/index.ts`, `options.ts`, `dev.ts`, `stdio.ts`, `shutdown.ts`; `test/mcp.spec.ts`, `cli.spec.ts`; shared `test/utils/relay.ts` adds optional bearer-gated MCP.
- Tests demonstrated failing before implementation: initial MCP tests were written before runnable CLI entry and forwarding handlers, without executable failing baseline. Later browser-opening regression was demonstrated failing before fix: real CAC/default dev invoked inert external opener once with no `--open` flag (`expected 1 to be +0`). Fixed parser checks explicit positive flag and lets `--no-open` override it. Regression then passed all three flag cases; no OS browser launched during regression.
- Commands and results: pinned upstream CAC/MCP declarations and implementation inspected. Root built library and inspector first. `/home/akryum/.local/share/mise/installs/node/26.2.0/bin/node node_modules/vitest/vitest.mjs run --project unit packages/devtools/test/mcp.spec.ts packages/devtools/test/cli.spec.ts` passed six initial tests with approved loopback access, repeated after lint cleanup. After browser-opening fix and rebuild, root combined focused run passed all nine MCP/CLI cases with inert launcher PATH. Restricted run failed with `listen EPERM`; no product regression inferred from that environment boundary. Scoped ESLint passed. Built-in CAC command actions replaced through supported `configureCli` hook because built-in dev action omits rstore relay ownership hooks. `capabilities.build: false` hides reports; fallback command rejects explicit `build`.
- Real HTTP/stdio MCP evidence: actual SDK clients passed Core connector CRUD, retained second record, duplicate command, cache write/delete, seeded read-only preservation, bearer requirements, and MCP-bearer RPC denial. StdIO invokes built ESM binary against same relay and verifies actual cache effect, absence of SDK parse errors/credential output, and process exit after cleanup.
- CLI/packaged-bin evidence: built ESM process tests passed help, deferred-build rejection, missing stdio connection, no-auth rejection, custom-base inspector HTML/discovery, single no-token hint, and listener closure after SIGTERM. Binary source includes shebang. Default base `/`; host/port/base configurable; no factory loading. Initial default dev checks unintentionally invoked upstream OS opener because CAC's negated option defaults `open=true`; explicit argv normalization now prevents it. Spawned development tests additionally use `--no-open`; source flag regression substitutes only external OS launcher with inert counter. Latest built-bin verification passed after root rebuild and under inert launcher PATH.
- Limitations / follow-up: full packed tarball outside-workspace proof belongs to S16 distribution gate. Credentials are environment-only: `RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN`, `RSTORE_DEVTOOLS_NODE_AUTH_TOKEN`, `RSTORE_DEVTOOLS_BROWSER_AUTH_TOKEN`, `RSTORE_DEVTOOLS_SSR_AUTH_TOKEN`; HTTP bearer `DEVFRAME_MCP_AUTH_TOKEN` must differ from every RPC credential. StdIO requires viewer credential and explicit `--connect`. Cleanup is idempotent and signal cleanup has five-second deadline. Failure sensitivity demonstrated for browser-opening regression; no broad fault-probe claim for MCP suite.

## Final coordinator acceptance

- Slice evidence: Actual HTTP SDK and spawned connected stdio clients read/mutated owning Core store, respected read-only/bearer roles, and closed cleanly. Installed CLI served assets at custom base, preserved protocol-only stdout, and exited after shutdown. Inert opener sentinel recorded zero unrequested browser launches.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
