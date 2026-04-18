# Skills Generation (rstore)

This file is the canonical process for generating and updating package skills in this repository.

## Scope

This process currently covers:

- `packages/vue/skills/rstore-vue`
- `packages/nuxt/skills/rstore-nuxt`
- `packages/nuxt-drizzle/skills/rstore-nuxt-drizzle`

## Sources of truth

Always generate skill content from documentation (not source code), and never generate from memory.

If implementation behavior appears to differ from docs, fix docs first, then regenerate skills from the updated docs.

### `@rstore/vue`

- `docs/guide/getting-started.md`
- `docs/guide/learn-more.md`
- `docs/guide/schema/collection.md`
- `docs/guide/schema/relations.md`
- `docs/guide/schema/federation.md`
- `docs/guide/schema/collection-defaults.md`
- `docs/guide/data/query.md`
- `docs/guide/data/mutation.md`
- `docs/guide/data/form.md`
- `docs/guide/data/live.md`
- `docs/guide/data/cache.md`
- `docs/guide/data/module.md`
- `docs/guide/data/offline.md`
- `docs/guide/plugin/setup.md`
- `docs/guide/plugin/hooks.md`

### `@rstore/nuxt`

- `docs/guide/getting-started.md` (Nuxt section)
- `docs/index.md` (Nuxt integration overview)
- `docs/guide/data/cache.md`
- `docs/guide/plugin/hooks.md`
- `docs/guide/data/query.md`

### `@rstore/nuxt-drizzle`

- `docs/plugins/nuxt-drizzle.md`
- `docs/guide/data/query.md`
- `docs/guide/data/live.md`
- `docs/guide/data/offline.md`
- `docs/guide/schema/relations.md`
- `docs/guide/plugin/hooks.md`

## Output files

For each package skill, generate:

1. `SKILL.md`
2. `references/index.md`
3. `references/api-*.md` (one file per API/config/hook element, linked from `references/index.md`)

Expected paths:

- `packages/vue/skills/rstore-vue/SKILL.md`
- `packages/vue/skills/rstore-vue/references/*.md`
- `packages/nuxt/skills/rstore-nuxt/SKILL.md`
- `packages/nuxt/skills/rstore-nuxt/references/*.md`
- `packages/nuxt-drizzle/skills/rstore-nuxt-drizzle/SKILL.md`
- `packages/nuxt-drizzle/skills/rstore-nuxt-drizzle/references/*.md`

## Required SKILL.md structure

Each generated `SKILL.md` should include:

1. YAML frontmatter:
   - `name`
   - `description` (single line, intent-first trigger text)
2. Title and one-line summary.
3. Documentation map table with docs URLs and/or shipped skill reference links.
4. Core concepts table (API or module primitives and what they do).
5. Quick-start snippet.
6. Practical guidance sections:
   - task/workflow guidance
   - extension points
   - guardrails/failure modes
7. References section containing a table (`Topic`, `Description`, `Reference`) that links every reference file.
8. Further reading section with docs URLs and/or shipped skill references (no source/test paths).

## Required references structure

Each skill should include a `references/` folder with API-reference files. Keep references one level deep from `SKILL.md`.

Mandatory layout:

- `references/index.md`: map every documented API/config/hook element to exactly one file.
- `references/api-<element>.md`: one file per API/config/hook element (for example `api-find-first.md`, `api-find-many.md`).

Each reference file should:

- start with a short title and one-line scope
- include a top `name`/`description` table
- include explicit sections in this order when possible: `Surface`, `Syntax`, `Behavior`, `Requirements`, `Pitfalls`
- include only behavior that is grounded in current docs
- focus on concrete API behavior, not broad conceptual overviews
- avoid linking to nested reference chains
- avoid bundling multiple API elements in one file

## Writing constraints

- Keep guidance practical and implementation-grounded.
- Prefer precise behavior over aspirational wording.
- Include only APIs/patterns that exist in current docs.
- Mark deprecations only when they are documented.
- Keep context lean: move deep detail to docs and skill references instead of embedding long prose.
- For wrapper skills, include explicit package-skill references:
  - `@rstore/nuxt` must reference the `rstore-vue` skill.
  - `@rstore/nuxt-drizzle` must reference both `rstore-nuxt` and `rstore-vue`.
- Never use cross-package relative paths (`../`) inside `SKILL.md`; reference other skills by skill name.
- Never reference local source/test files from `SKILL.md` or `references/*.md` files.
- Do not generate or update `agents/openai.yaml` for this workflow.

### Frontmatter description rules (trigger quality)

The `description` field is the primary trigger signal used by AI agents. Write it for natural user intent matching, not for API catalog completeness.

- Start with the user goal/outcome (`fetch data`, `update records`, `set up integration`, `debug hydration`) and then mention package-specific cues.
- Start with explicit intent language such as `Use for ...`, `Use when ...`, `set up`, `fix`, `debug`, `migrate`, `integrate`, `extend`.
- Include both broad task phrases and concrete package cues (for example: `Nuxt module setup`, `SSR hydration`, `Drizzle filters`, `query/liveQuery`, `createForm`).
- Prefer user-language synonyms over only internal API names.
- Keep it on one line and avoid parenthetical API dumps.
- Keep wrapper boundaries clear:
  - `rstore-nuxt`: Nuxt module/runtime integration concerns; explicitly reference the `rstore-vue` skill by name.
  - `rstore-nuxt-drizzle`: Drizzle-backed generation/API/realtime/offline concerns; explicitly reference both `rstore-nuxt` and `rstore-vue` by name.
  - `rstore-vue`: base store/query/form/plugin/module behavior.

## Generation workflow

### 1. Gather context

```bash
rg --files docs
rg -n "defineCollection|query|liveQuery|createForm|definePlugin|defineModule|rstoreDrizzle|allowTables|drizzleImport|rstoreDirs" docs
```

Read the documentation source-of-truth files listed above.
If docs are missing or contradictory, update docs first and use the updated docs as the generation input.

### 2. Regenerate package skills

- Regenerate `SKILL.md` for each package using the required structure.
- Regenerate `references/index.md` and `references/api-*.md` with one file per API/config/hook element.
- Ensure `SKILL.md` links to `references/index.md`.

### 3. Validate generated skills

```bash
sed -n '1,260p' packages/vue/skills/rstore-vue/SKILL.md
sed -n '1,260p' packages/nuxt/skills/rstore-nuxt/SKILL.md
sed -n '1,320p' packages/nuxt-drizzle/skills/rstore-nuxt-drizzle/SKILL.md
```

Checklist:

- [ ] Frontmatter is valid and trigger description is specific.
- [ ] Every major claim is backed by current docs.
- [ ] Quick-start snippets are valid for the package.
- [ ] Guardrails mention real failure modes from runtime behavior.
- [ ] `references/index.md` exists and links to all `references/api-*.md` files.
- [ ] Each `api-*.md` file documents exactly one API/config/hook element.
- [ ] `SKILL.md` contains a reference table (`Topic`, `Description`, `Reference`) covering all skill references.
- [ ] `rstore-nuxt` references the `rstore-vue` skill by name (no cross-package relative paths).
- [ ] `rstore-nuxt-drizzle` references both `rstore-nuxt` and `rstore-vue` by name (no cross-package relative paths).
- [ ] No source/test file paths are referenced from skill files.

### 4. Record generation metadata

After regeneration, update this document:

- Generation date
- Docs commit SHA
- Version notes (if applicable)
- What was regenerated

## Incremental update process

When documentation changes, update only impacted skills.

```bash
git diff <last_skill_sha>..HEAD -- docs
git diff --name-only <last_skill_sha>..HEAD -- docs
```

Then:

1. Map changed docs files to affected package skills.
2. Update only relevant sections.
3. Re-validate claims against current docs.
4. Refresh metadata below.

## Current generation metadata

- Last generation date: 2026-03-08
- Docs commit SHA: `4d458c9edaf98cc52884c8e8547d5b5e9884c03b`
- Docs short SHA: `4d458c9`
- Docs commit date: 2026-03-03 01:53:55 +0100
- Docs commit message: `fix(module): module getting disposed`
- Generated artifacts:
  - `packages/vue/skills/rstore-vue/SKILL.md`
  - `packages/vue/skills/rstore-vue/references/*.md`
  - `packages/nuxt/skills/rstore-nuxt/SKILL.md`
  - `packages/nuxt/skills/rstore-nuxt/references/*.md`
  - `packages/nuxt-drizzle/skills/rstore-nuxt-drizzle/SKILL.md`
  - `packages/nuxt-drizzle/skills/rstore-nuxt-drizzle/references/*.md`

### 2026-04-18 incremental update

- Updated `docs/plugins/nuxt-drizzle.md` "Allowing tables" section with maintenance warning.
- Updated `packages/nuxt-drizzle/skills/rstore-nuxt-drizzle/SKILL.md` (description trigger, task workflow step 7, guardrail 7).
- Updated `packages/nuxt-drizzle/skills/rstore-nuxt-drizzle/references/api-allow-tables.md` (behavior, requirements, pitfalls 2-3).
- Reason: real-world incident where adding a new Drizzle table triggered `Collection "<name>" is not allowed.` because the project already used `allowTables` and the new table wasn't registered. Skill failed to anticipate this maintenance step.

## Notes

- There is no dedicated generation script in this repository yet.
- Generation is currently a documented manual process with reproducible inspection commands.
