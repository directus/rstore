# rstore Contributing Guide

Welcome! We are really excited that you are interested in contributing to rstore! Before submitting your contribution, please make sure to take a moment and read through the following guide:

## Means of Contributing

Contributing doesn't necessarily mean you need to write code and open Pull Requests. There are many other ways you can help the project!

- Try the [latest version](https://github.com/Akryum/rstore/releases) of rstore and [report bugs](https://github.com/Akryum/rstore/issues/new?assignees=&labels=to+triage&template=bug-report.yml).
- Discuss your ideas with the community on the [discussion board](https://github.com/Akryum/rstore/discussions).
- Answer to other people's questions.
- Report typos or issues of the docs.
- Support us financially on GitHub sponsors:
  - [Guillaume](https://github.com/sponsors/Akryum)
- Do you like rstore? Spread the love on social media!

## Packages

This mono-repo contains the following packages:

| Package | Description |
| ------- | ----------- |
| [@rstore/core](./packages/core) | Core reusable logic |
| [@rstore/shared](./packages/shared) | Common types and utils |
| [@rstore/vue](./packages/vue) | Vue integration |
| [@rstore/nuxt](./packages/nuxt) | Nuxt integration |
| [playground](./packages/playground) | Playground app |

## Local dev setup

1. Install dependencies with [pnpm](https://pnpm.io/):

```sh
node corepack enable
pnpm i
```

2. Compile rstore in dev mode:

```sh
pnpm run dev
```

## Running tests

### Linting

We use ESLint to check for code quality and style.

```sh
# Root of the mono-repo
pnpm run lint
```

### Unit tests

We use [Vitest](https://vitest.dev/) to run unit tests on workspaces listed under the `packages` folder.

For developping:

```sh
# Root of the mono-repo
pnpm run test:dev
```

(You can also run this in specific package folders.)

For running all tests in the terminal:

```sh
# Root of the mono-repo
pnpm run test
```

## Pull Request Guidelines

- Checkout a topic branch from a base branch, e.g. `main`, and merge back against that branch.

- If adding a new feature:

  - Add accompanying test case.
  - Provide a convincing reason to add this feature. Ideally, you should open a suggestion issue first and have it approved before working on it.

- If fixing bug:

  - If you are resolving a special issue, add `(fix #xxxx[,#xxxx])` (#xxxx is the issue id) in your PR title for a better release log, e.g. `fix: update entities encoding/decoding (fix #3899)`.
  - Provide a detailed description of the bug in the PR. Live demo preferred.
  - Add appropriate test coverage if applicable.

- It's OK to have multiple small commits as you work on the PR - GitHub can automatically squash them before merging.

- Make sure to follow the code style of the project.

- Make sure tests pass!

- Commit messages must follow the [commit message convention](./.github/commit-convention.md) so that changelogs can be automatically generated.<!-- Commit messages are automatically validated before commit (by invoking [Git Hooks](https://git-scm.com/docs/githooks) via [yorkie](https://github.com/yyx990803/yorkie)). -->

<!--
- No need to worry about code style as long as you have installed the dev dependencies - modified files are automatically formatted with ESLint on commit (by invoking [Git Hooks](https://git-scm.com/docs/githooks) via [yorkie](https://github.com/yyx990803/yorkie)).
-->
