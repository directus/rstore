# Multiplayer behavior tests

`messageGuards.spec.ts` and `sanitizeUpdate.spec.ts` protect real exported
protocol/helper contracts in Node. Native collaboration and lifecycle scenarios
live in `test/browser/multiplayer{Channel,Field,Form}.spec.ts`; run through
repository's guarded `pnpm test:browser --project headless` runner.
Native document focus-loss contract lives in `multiplayerFocus.spec.ts` under
private headed focus project, sharing existing `focusDriver` helpers.

Browser scenarios execute current channel, field and form sources, actual
VueUse `useWebSocket`, actual `createFormObject`, actual Nuxt
`createNuxtApp`/`useRuntimeConfig`, native browser WebSocket and Vue component
mount/unmount. Build flags configure a minimal Nuxt client runtime; scoped
compiler plugin applies those flags to installed Nuxt runtime modules. Client
endpoint comes from hydrated public runtime config, exercising option fallback.

Only external relay service is simulated. Vite's installed `ws` implementation
accepts native browser sockets, echoes wire frames including self echoes, allows
literal server injections and records copied network payloads. It implements no
owned channel, room filtering, field, form or sanitization logic. These tests
prove client behavior over native transport; they do not prove reference server
authorization or provider interoperability.

## Scenario preflight

- **Channel identity/rooms:** real public channel and two independent applications
  share native relay. Same user with different client IDs must receive each
  other's edit; own echoed updates stay absent. Literal forbidden-room presence,
  updates and leave arrive after populated allowed peer. Allowed update acts as
  subsequent wire barrier. Exact form values and surviving IDs reject user-ID
  filtering, wrong-room application and removal of all user's connections.
- **Heartbeat/expiry:** literal identical live presence repeats every second;
  second peer sends one frame only. Real 15-second lifetime and five-second sweep
  must retain live connection and remove absent one within 25 seconds. Exact
  retained ID rejects using deduplicated `ws.data` watcher. External heartbeat
  requests are bounded, tracked and settled before relay teardown.
- **Field ownership:** native title/body inputs invoke actual hooks; second app
  exposes remote focus. Native document focus loss plus input blur must clear
  peer focus; immediate blur/refocus must emit no clear. Repeated blur produces
  one clear; inactive blur produces none; changing supported reactive field
  option rejects stale blur. Moving title to body must retain body after native
  timer turn. Remote field and exact wire presence sequences reject stale clear,
  missing cancellation or duplicate timer work. No fake clocks or document shim.
- **Incoming form updates:** actual form receives literal mixed allowed/denied
  fields and own `__proto__`, `constructor`, `prototype` JSON keys through native
  channel. Independent populated base publication plus exact form values reject
  sanitizer bypass even when form's own normalization protects form proxy.
  Explicit received/base key arrays preserve `__proto__` evidence across browser
  automation serialization, which may drop own prototype keys from plain
  returned objects. Received forbidden keys must reach real adapter; published
  base's complete keys must exclude them.
  Separate tracked/no-allowlist scenarios preserve distinct option contracts.
  Untracked-only update must preserve local edit, populated acknowledged base,
  undo usability and absence of prototype pollution.
- **Collaboration/history:** two real forms receive edits, undo and redo over
  native channel. Exact peer values and update payload history reject missing
  synchronization, missing fields, duplicate rebroadcast and local-only history.
  Both tracked-field and omitted-allowlist configurations synchronize history;
  omitted allowlist publishes all public form data including `isAdmin: false`.
  Sequential disjoint edits preserve each form's existing local operations while
  converging exact title/body values. Recorded per-socket presence barriers
  follow queued rebases; exact two-update history rejects echoed local operations.
- **Lifetime:** retain form proxy after real child subscriber unmount while its
  parent channel and other application stay open. Detached edits must emit no
  wire update and must leave peer form unchanged; live peer can still publish
  through surviving channel. This rejects leaked subscription independently of
  transport closure. VueUse currently auto-unsubscribes real form event hook from
  component scope; native scenario confirms that integration. Form interface
  accepts actual `{ off() }` handle without fixture adaptation. Separate
  Queued real undo plus child unmount in same native turn must keep undo's
  local result without publishing it after ownership ends; peer retains
  populated previous body while fresh peer edit still arrives on open channel.
  Separate application-unmount scenario observes exact native
  open-socket count and absence of stale delivery, then final socket release.

Every acquired app/root/context and socket is recorded independently of source
cleanup. Fixture teardown closes remaining resources after assertion failures;
scored cleanup assertions occur before that repair. Native timer completion uses
queued zero-delay turn, followed by bounded public observation.

## Replaced coverage map

| Previous case | Retained public check |
| --- | --- |
| Identical heartbeat refresh and eventual stale removal | Live/stale two-peer expiry scenario |
| Self echo filtered by client ID rather than user ID | Same-user two-application peer identities and native self echo |
| Same-user remote edit applied; own edit echo ignored | Same-user forms converge; sender `remoteUpdate` stays null |
| Two connections aggregate as one user; one leave retained | Exact two connection IDs, aggregate user, one surviving ID |
| Outgoing frame stamps client ID and user | Exact native presence/update frames |
| Other room ignored | Populated allowed peer survives wrong-room presence/update/leave |
| Blur clears despite document losing focus | Real second browser tab and native input blur |
| Blur/refocus cancellation | Native same-turn focus/blur/focus, no clear frame |
| Repeated blur coalescing | Three actual callbacks; one clear frame |
| Blur on inactive field | No extra outgoing presence after actual timer turn |
| Per-hook active-field validation | Supported reactive field option changes reject stale blur |
| Tracked allowlist and proto key filtering | Exact real form and published base after hostile mixed frame |
| Only forbidden/untracked keys ignored | Populated base and local edit preserved; undo still works |
| Forbidden keys without tracked allowlist | Separate no-allowlist real form/base scenario |

Latest shared-channel field ownership, native socket cleanup, real form
subscriber cleanup, disjoint-edit convergence, history message counts and queued
undo disposal are additional contracts protected by native scenarios. They were
not established by previous stub call-count assertions.
