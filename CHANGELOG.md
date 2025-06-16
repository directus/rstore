# Changelog


## v0.6.16

[compare changes](https://github.com/directus/rstore/compare/v0.6.15...v0.6.16)

### 🚀 Enhancements

- Field serialize, fix #41 ([#41](https://github.com/directus/rstore/issues/41))

### 🩹 Fixes

- Peek methods returning empty results when called directly, fix #42 ([#42](https://github.com/directus/rstore/issues/42))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.15

[compare changes](https://github.com/directus/rstore/compare/v0.6.14...v0.6.15)

### 🩹 Fixes

- **vue:** Cache attempting to write null items in relations ([db88234](https://github.com/directus/rstore/commit/db88234))

### 🏡 Chore

- Pnpm in git hook ([caead6b](https://github.com/directus/rstore/commit/caead6b))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.14

[compare changes](https://github.com/directus/rstore/compare/v0.6.13...v0.6.14)

### 🚀 Enhancements

- **nuxt:** Run plugin before router ([8572e56](https://github.com/directus/rstore/commit/8572e56))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.13

[compare changes](https://github.com/directus/rstore/compare/v0.6.12...v0.6.13)

### 🩹 Fixes

- **nuxt:** Duplicate scan dirs with app ([86ea149](https://github.com/directus/rstore/commit/86ea149))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.12

[compare changes](https://github.com/directus/rstore/compare/v0.6.11...v0.6.12)

### 🩹 Fixes

- **nuxt:** Use layer srcDir instead of rootDir ([35eddf6](https://github.com/directus/rstore/commit/35eddf6))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.11

[compare changes](https://github.com/directus/rstore/compare/v0.6.10...v0.6.11)

### 🚀 Enhancements

- Support nuxt layer, closes #8 ([#8](https://github.com/directus/rstore/issues/8))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.10

[compare changes](https://github.com/directus/rstore/compare/v0.6.9...v0.6.10)

### 🚀 Enhancements

- **vue:** Cache use weakmap for wrapped item cache ([90e840a](https://github.com/directus/rstore/commit/90e840a))

### 🩹 Fixes

- **vue:** Clear model cache on `removeModel` ([38d720d](https://github.com/directus/rstore/commit/38d720d))
- Revert call form object ([0fc4952](https://github.com/directus/rstore/commit/0fc4952))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.9

[compare changes](https://github.com/directus/rstore/compare/v0.6.8...v0.6.9)

### 🚀 Enhancements

- **nuxt-drizzle:** Support with, columns, top-level orderBy ([#36](https://github.com/directus/rstore/pull/36))

### 🩹 Fixes

- **nuxt-drizzle:** PrimaryKeys use item keys instead of column names ([4115eb8](https://github.com/directus/rstore/commit/4115eb8))
- **nuxt-drizzle:** In relations use keys instead of columns names ([dcb93f4](https://github.com/directus/rstore/commit/dcb93f4))

### 🏡 Chore

- Copy readme to all packages ([a804085](https://github.com/directus/rstore/commit/a804085))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.8

[compare changes](https://github.com/directus/rstore/compare/v0.6.7...v0.6.8)

### 🩹 Fixes

- **nuxt-drizzle:** Missing useRequestFetch import ([f4aac90](https://github.com/directus/rstore/commit/f4aac90))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.7

[compare changes](https://github.com/directus/rstore/compare/v0.6.6...v0.6.7)

### 🚀 Enhancements

- **form:** Call form object ([6fdb1aa](https://github.com/directus/rstore/commit/6fdb1aa))

### 🩹 Fixes

- **nuxt drizzle:** Use request fetch ([7e7493b](https://github.com/directus/rstore/commit/7e7493b))
- **nuxt-drizzle:** Relations handling ([5afaa22](https://github.com/directus/rstore/commit/5afaa22))
- **nuxt-drizzle:** Primary key multi columns ([0fa1424](https://github.com/directus/rstore/commit/0fa1424))

### 🏡 Chore

- Update pnpm ([62f6985](https://github.com/directus/rstore/commit/62f6985))
- **playground:** More stuff ([f2237f2](https://github.com/directus/rstore/commit/f2237f2))
- **playground:** Db explorer ([eef0271](https://github.com/directus/rstore/commit/eef0271))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.6

[compare changes](https://github.com/directus/rstore/compare/v0.6.5...v0.6.6)

### 🚀 Enhancements

- **form:** $valid ([c07d4e9](https://github.com/directus/rstore/commit/c07d4e9))
- **form:** $onChange and merge createFormObjectWithChangeDetection into createFormObject ([18ae2b9](https://github.com/directus/rstore/commit/18ae2b9))

### 🩹 Fixes

- Refresh force fetch ([6651650](https://github.com/directus/rstore/commit/6651650))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.5

[compare changes](https://github.com/Akryum/rstore/compare/v0.6.4...v0.6.5)

### 🚀 Enhancements

- **drizzle:** Limit and offset ([585d705](https://github.com/Akryum/rstore/commit/585d705))

### 🩹 Fixes

- **drizzle:** No key found ([3a47a0a](https://github.com/Akryum/rstore/commit/3a47a0a))

### 🏡 Chore

- Drizzle playground devtools ([a546812](https://github.com/Akryum/rstore/commit/a546812))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.4

[compare changes](https://github.com/directus/rstore/compare/v0.6.3...v0.6.4)

### 🚀 Enhancements

- **form:** Rename $save to $submit ([dbf46cb](https://github.com/directus/rstore/commit/dbf46cb))
- **form:** Rename $onSaved to $onSuccess ([d363e72](https://github.com/directus/rstore/commit/d363e72))
- **vue:** Export createFormObject and createFormObjectWithChangeDetection ([6b6c94f](https://github.com/directus/rstore/commit/6b6c94f))
- **vue:** Form.$onError event hook ([f09d156](https://github.com/directus/rstore/commit/f09d156))
- **query:** Expose meta ([7950c24](https://github.com/directus/rstore/commit/7950c24))
- **subscribe:** Expose meta ([4b17eeb](https://github.com/directus/rstore/commit/4b17eeb))

### 🩹 Fixes

- Subscribe should not return a promise ([a461e65](https://github.com/directus/rstore/commit/a461e65))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.3

[compare changes](https://github.com/directus/rstore/compare/v0.6.2...v0.6.3)

### 🩹 Fixes

- **nuxt:** Should dedupe modules per request during SSR ([73f1aa5](https://github.com/directus/rstore/commit/73f1aa5))

### 🏡 Chore

- Use npm exec instead of pnpm in git hook ([c84118e](https://github.com/directus/rstore/commit/c84118e))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.2

[compare changes](https://github.com/Akryum/rstore/compare/v0.6.1...v0.6.2)

### 🚀 Enhancements

- **devtools:** More displayed in module exposed props ([a91f51b](https://github.com/Akryum/rstore/commit/a91f51b))

### 🩹 Fixes

- Not deduping on model, closes #31 ([#31](https://github.com/Akryum/rstore/issues/31))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.1

[compare changes](https://github.com/Akryum/rstore/compare/v0.6.0...v0.6.1)

### 🚀 Enhancements

- Record module mutations in the mutation history ([db41348](https://github.com/Akryum/rstore/commit/db41348))

### 🩹 Fixes

- **vue:** Throw error in wrapped mutation ([d78e144](https://github.com/Akryum/rstore/commit/d78e144))

### 💅 Refactors

- Deprecate store.$createModule -> use createModule directly ([757d48a](https://github.com/Akryum/rstore/commit/757d48a))

### 📖 Documentation

- Update federation docs ([c9f518e](https://github.com/Akryum/rstore/commit/c9f518e))
- More cache docs ([6c239c1](https://github.com/Akryum/rstore/commit/6c239c1))

### 🏡 Chore

- Add create module API jsdoc ([dbe1db9](https://github.com/Akryum/rstore/commit/dbe1db9))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.6.0

[compare changes](https://github.com/Akryum/rstore/compare/v0.5.9...v0.6.0)

### 🚀 Enhancements

- Scope id, closes #9 ([#9](https://github.com/Akryum/rstore/issues/9))
- **devtools:** Plugins tab ([b48bf6c](https://github.com/Akryum/rstore/commit/b48bf6c))
- Modules, closes #10 ([#10](https://github.com/Akryum/rstore/issues/10))

### 🩹 Fixes

- **drizzle:** Table with different name not recognized, fix #30 ([#30](https://github.com/Akryum/rstore/issues/30))

### 📖 Documentation

- Added some schemas ([1db4dc6](https://github.com/Akryum/rstore/commit/1db4dc6))

### 🌊 Types

- **nuxt:** Add Store, StoreResolvedModelItem and StoreWrappedItem to auto imports ([3ef23c3](https://github.com/Akryum/rstore/commit/3ef23c3))
- Check for excess properties in `defineItemType.model` ([c52fb38](https://github.com/Akryum/rstore/commit/c52fb38))
- **vue:** Check for excess properties in queryFirst, queryMany ([b6e2453](https://github.com/Akryum/rstore/commit/b6e2453))
- **nuxt:** Don't use ModelDefaults as the store defaults type parameters to allow excess properties check ([758a4ea](https://github.com/Akryum/rstore/commit/758a4ea))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.5.9

[compare changes](https://github.com/Akryum/rstore/compare/v0.5.8...v0.5.9)

### 🚀 Enhancements

- **vue:** Disable query ([1316655](https://github.com/Akryum/rstore/commit/1316655))

### 🩹 Fixes

- **vue:** Form validation issues handling ([9f2b238](https://github.com/Akryum/rstore/commit/9f2b238))
- **fields:** Handle parsing fields of nested relations, fix #25 ([#25](https://github.com/Akryum/rstore/issues/25))

### 📖 Documentation

- Comparisons ([3af462b](https://github.com/Akryum/rstore/commit/3af462b))
- Typo and fixes ([cca2fe1](https://github.com/Akryum/rstore/commit/cca2fe1))

### 🌊 Types

- Fix model.fields requiring all fields ([a4a02bb](https://github.com/Akryum/rstore/commit/a4a02bb))

### 🏡 Chore

- Update issue repro links ([3a5651d](https://github.com/Akryum/rstore/commit/3a5651d))
- Disable build in commit hook ([65fc756](https://github.com/Akryum/rstore/commit/65fc756))

### ✅ Tests

- **vue:** Some tests ([b4b10a0](https://github.com/Akryum/rstore/commit/b4b10a0))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.5.8

[compare changes](https://github.com/Akryum/rstore/compare/v0.5.7...v0.5.8)

### 🚀 Enhancements

- As const is no longer required ([58639ff](https://github.com/Akryum/rstore/commit/58639ff))
- Refresh queries on cache reset, closes #4 ([#4](https://github.com/Akryum/rstore/issues/4))
- Dedupe findFirst and findMany, fix #16 ([#16](https://github.com/Akryum/rstore/issues/16))

### 🩹 Fixes

- **drizzle:** Named column breaking primary keys, fix #20 ([#20](https://github.com/Akryum/rstore/issues/20))

### 🏡 Chore

- Update pnpm and refresh lockfile ([aeb00c8](https://github.com/Akryum/rstore/commit/aeb00c8))
- Cleanup variable names ([33be02b](https://github.com/Akryum/rstore/commit/33be02b))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.5.7

[compare changes](https://github.com/Akryum/rstore/compare/v0.5.6...v0.5.7)

- Republishing packages

### 📖 Documentation

- Fix dead links ([e87a44c](https://github.com/Akryum/rstore/commit/e87a44c))
- Add directus in getting started ([ad426a7](https://github.com/Akryum/rstore/commit/ad426a7))
- Fix typo ([9de9e53](https://github.com/Akryum/rstore/commit/9de9e53))
- Fix other typo ([9968cf8](https://github.com/Akryum/rstore/commit/9968cf8))

### 🏡 Chore

- Build docs in commit hook ([2887bc5](https://github.com/Akryum/rstore/commit/2887bc5))
- Run some scripts in commit in parallel ([ab276b1](https://github.com/Akryum/rstore/commit/ab276b1))
- Improve lint-staged config ([ee2787b](https://github.com/Akryum/rstore/commit/ee2787b))
- Only rerun everything on pnpm-lock ([bfc08e5](https://github.com/Akryum/rstore/commit/bfc08e5))

### 🤖 CI

- Fix pnpm install ([862055f](https://github.com/Akryum/rstore/commit/862055f))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.5.6

[compare changes](https://github.com/Akryum/rstore/compare/v0.5.5...v0.5.6)

### 🚀 Enhancements

- Allow customizing FindOptions interface ([42a818d](https://github.com/Akryum/rstore/commit/42a818d))
- **nuxt-drizzle:** Customize apiPath ([f78bc4c](https://github.com/Akryum/rstore/commit/f78bc4c))
- New @rstore/nuxt-directus package ([6c9dd60](https://github.com/Akryum/rstore/commit/6c9dd60))

### 🩹 Fixes

- **devtools:** Tailwind config ([684adff](https://github.com/Akryum/rstore/commit/684adff))
- **nuxt-drizzle:** Scope fetchRelations ([bf629c3](https://github.com/Akryum/rstore/commit/bf629c3))

### 💅 Refactors

- **nuxt-drizzle:** Moved `where` to find options and removed `moduleOptions.drizzleImport.default` ([39ebb86](https://github.com/Akryum/rstore/commit/39ebb86))

### 📖 Documentation

- Link to nuxt drizzle codesandbox ([3ca066b](https://github.com/Akryum/rstore/commit/3ca066b))
- Remove sponsors section ([65841ca](https://github.com/Akryum/rstore/commit/65841ca))
- Remove sponsors from homepage ([fba1f0f](https://github.com/Akryum/rstore/commit/fba1f0f))

### 🏡 Chore

- Fix typo ([#19](https://github.com/Akryum/rstore/pull/19))
- Fix tailwind config ([4256e06](https://github.com/Akryum/rstore/commit/4256e06))
- Skip playground prepare ([d65ad58](https://github.com/Akryum/rstore/commit/d65ad58))
- Cleanup playgrounds ([43692b8](https://github.com/Akryum/rstore/commit/43692b8))
- Typo ([dd5be8f](https://github.com/Akryum/rstore/commit/dd5be8f))
- Nuxt module cleanup ([e9a878e](https://github.com/Akryum/rstore/commit/e9a878e))
- Fix nuxt module build ([3e3572e](https://github.com/Akryum/rstore/commit/3e3572e))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))
- Konv Suu <2583695112@qq.com>

## v0.5.5

[compare changes](https://github.com/Akryum/rstore/compare/v0.5.4...v0.5.5)

### 🩹 Fixes

- Type imports ([1915d5c](https://github.com/Akryum/rstore/commit/1915d5c))
- **drizzle:** AddServerScanDir not working ([744558a](https://github.com/Akryum/rstore/commit/744558a))

### 📖 Documentation

- Nuxt drizzle filter and relation ([d62a705](https://github.com/Akryum/rstore/commit/d62a705))
- Nuxt drizzle more docs ([5d18348](https://github.com/Akryum/rstore/commit/5d18348))
- Utilize the `defineRstorePlugin` function in the nuxt example section ([#18](https://github.com/Akryum/rstore/pull/18))

### 🏡 Chore

- Simpler drizzle playground ([cfe578a](https://github.com/Akryum/rstore/commit/cfe578a))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))
- Phojie Rengel ([@phojie](http://github.com/phojie))

## v0.5.4

[compare changes](https://github.com/Akryum/rstore/compare/v0.5.3...v0.5.4)

### 🩹 Fixes

- **nuxt-drizzle:** Dynamic import of '@rstore/nuxt/api' in case it is not installed yet ([6519ac5](https://github.com/Akryum/rstore/commit/6519ac5))

### 📖 Documentation

- Remove demo link (temporary) ([6bd9ac8](https://github.com/Akryum/rstore/commit/6bd9ac8))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.5.3

[compare changes](https://github.com/Akryum/rstore/compare/v0.5.2...v0.5.3)

### 🚀 Enhancements

- New @rstore/nuxt-drizzle package ([e8fa3cd](https://github.com/Akryum/rstore/commit/e8fa3cd))
- **devtools:** Model meta ([18624cd](https://github.com/Akryum/rstore/commit/18624cd))
- **devtools:** Computed fields ([ea95c2d](https://github.com/Akryum/rstore/commit/ea95c2d))

### 🩹 Fixes

- **devtools:** Model search scrolling with list ([bb08cef](https://github.com/Akryum/rstore/commit/bb08cef))

### 📖 Documentation

- Update devtools screenshot ([399c55b](https://github.com/Akryum/rstore/commit/399c55b))
- Nuxt-drizzle ([ec3c95d](https://github.com/Akryum/rstore/commit/ec3c95d))
- Update readme ([b659089](https://github.com/Akryum/rstore/commit/b659089))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.5.2

[compare changes](https://github.com/Akryum/rstore/compare/v0.5.1...v0.5.2)

### 🚀 Enhancements

- Allow number key ([0283aad](https://github.com/Akryum/rstore/commit/0283aad))
- **nuxt:** AddModelImport and addPluginImport ([807d859](https://github.com/Akryum/rstore/commit/807d859))
- **vue:** Only send changed props in update form ([3163845](https://github.com/Akryum/rstore/commit/3163845))

### 🩹 Fixes

- **devtools:** Tab label ([be636f1](https://github.com/Akryum/rstore/commit/be636f1))
- Transform store so it's the same in hooks ([d948346](https://github.com/Akryum/rstore/commit/d948346))
- Remove check for special keys in update form object ([19b60e8](https://github.com/Akryum/rstore/commit/19b60e8))
- **vue:** Number item key checks ([e55f5a9](https://github.com/Akryum/rstore/commit/e55f5a9))

### 📖 Documentation

- Link to demo playground ([937a556](https://github.com/Akryum/rstore/commit/937a556))
- Missing destructure ([7f45dc1](https://github.com/Akryum/rstore/commit/7f45dc1))
- Fix cache page empty codeblock ([8a17b8f](https://github.com/Akryum/rstore/commit/8a17b8f))
- Links to directus ([1923d6e](https://github.com/Akryum/rstore/commit/1923d6e))
- Federation ([1e9e391](https://github.com/Akryum/rstore/commit/1e9e391))

### 🌊 Types

- Add generics to CustomParams and CustomSortOption ([d9e2712](https://github.com/Akryum/rstore/commit/d9e2712))

### 🏡 Chore

- Add name to playground ws server ([79ff206](https://github.com/Akryum/rstore/commit/79ff206))
- Add playground-drizzle ([43308b1](https://github.com/Akryum/rstore/commit/43308b1))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.5.1

[compare changes](https://github.com/Akryum/rstore/compare/v0.5.0...v0.5.1)

### 🚀 Enhancements

- GetKey methods ([de42243](https://github.com/Akryum/rstore/commit/de42243))
- IsServer ([ddd2553](https://github.com/Akryum/rstore/commit/ddd2553))
- Subscriptions ([e68b66c](https://github.com/Akryum/rstore/commit/e68b66c))
- **devtools:** Show cache writes ([db0de73](https://github.com/Akryum/rstore/commit/db0de73))
- **devtools:** Improved history item design ([acf065f](https://github.com/Akryum/rstore/commit/acf065f))
- Live queries ([0361cca](https://github.com/Akryum/rstore/commit/0361cca))
- **devtools:** Subscriptions ([d554862](https://github.com/Akryum/rstore/commit/d554862))
- **devtools:** More empty states ([8af50ee](https://github.com/Akryum/rstore/commit/8af50ee))

### 🩹 Fixes

- Form object types not including item props if no schema ([21ced4a](https://github.com/Akryum/rstore/commit/21ced4a))
- Don't write to cache if no items ([124f014](https://github.com/Akryum/rstore/commit/124f014))

### 💅 Refactors

- Use nullish coalescing assignment ([2e6f0ff](https://github.com/Akryum/rstore/commit/2e6f0ff))

### 📖 Documentation

- Add more details in the readme ([c47c334](https://github.com/Akryum/rstore/commit/c47c334))
- Fix home title ([650fcb6](https://github.com/Akryum/rstore/commit/650fcb6))
- New home page ([66cdfc8](https://github.com/Akryum/rstore/commit/66cdfc8))
- Cleanup homepage ([d3293c7](https://github.com/Akryum/rstore/commit/d3293c7))
- Subscriptions ([c5d2bce](https://github.com/Akryum/rstore/commit/c5d2bce))
- Cache ([2dc60be](https://github.com/Akryum/rstore/commit/2dc60be))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.5.0

[compare changes](https://github.com/Akryum/rstore/compare/v0.4.0...v0.5.0)

### 🚀 Enhancements

- AddModel and removeModel ([e5688ad](https://github.com/Akryum/rstore/commit/e5688ad))

### 🩹 Fixes

- Use own $schema in form object ([cbc40fe](https://github.com/Akryum/rstore/commit/cbc40fe))
- Better model name check ([260bb0c](https://github.com/Akryum/rstore/commit/260bb0c))

### 💅 Refactors

- Model.schema -> model.formSchema ([d29b714](https://github.com/Akryum/rstore/commit/d29b714))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.4.0

[compare changes](https://github.com/Akryum/rstore/compare/v0.3.0...v0.4.0)

### 💅 Refactors

- defineModel -> defineDataModel ([4f9a12e](https://github.com/Akryum/rstore/commit/4f9a12e))

### 📖 Documentation

- Home page ([9509ab8](https://github.com/Akryum/rstore/commit/9509ab8))
- Footer ([3656a91](https://github.com/Akryum/rstore/commit/3656a91))
- Remove example files ([ae7ce07](https://github.com/Akryum/rstore/commit/ae7ce07))
- Update homepage ([e0c3b59](https://github.com/Akryum/rstore/commit/e0c3b59))
- Update home page animation ([332dcf0](https://github.com/Akryum/rstore/commit/332dcf0))
- Typo ([0c45e1c](https://github.com/Akryum/rstore/commit/0c45e1c))
- Update cache read hooks ([b1ed837](https://github.com/Akryum/rstore/commit/b1ed837))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.3.0

[compare changes](https://github.com/Akryum/rstore/compare/v0.2.1...v0.3.0)

### 🚀 Enhancements

- Throw error if model name starts with $ ([06d944e](https://github.com/Akryum/rstore/commit/06d944e))
- **vue:** Store.$model('model_name') ([c0dc3b5](https://github.com/Akryum/rstore/commit/c0dc3b5))

### 🩹 Fixes

- **nuxt:** Payload key ([d7baee2](https://github.com/Akryum/rstore/commit/d7baee2))

### 💅 Refactors

- Models is now an array of models ([0d0977f](https://github.com/Akryum/rstore/commit/0d0977f))
- Store native props now starts with $ ([e586006](https://github.com/Akryum/rstore/commit/e586006))

### 📖 Documentation

- Fix logo ([719a620](https://github.com/Akryum/rstore/commit/719a620))
- Add link to website ([20e07c3](https://github.com/Akryum/rstore/commit/20e07c3))
- More! ([0fa12ca](https://github.com/Akryum/rstore/commit/0fa12ca))
- Update GitHub Link ([598179e](https://github.com/Akryum/rstore/commit/598179e))
- Fix light theme colors ([488e349](https://github.com/Akryum/rstore/commit/488e349))
- Updates ([029a57c](https://github.com/Akryum/rstore/commit/029a57c))
- Mutations ([9819f11](https://github.com/Akryum/rstore/commit/9819f11))
- Plugins ([e3be918](https://github.com/Akryum/rstore/commit/e3be918))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))
- Alexandre Chopin ([@alexchopin](http://github.com/alexchopin))

## v0.2.1

[compare changes](https://github.com/Akryum/rstore/compare/v0.2.0...v0.2.1)

### 🚀 Enhancements

- **vue:** Refresh() ([3bb42b1](https://github.com/Akryum/rstore/commit/3bb42b1))

### 📖 Documentation

- Init ([e33205c](https://github.com/Akryum/rstore/commit/e33205c))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.2.0

[compare changes](https://github.com/Akryum/rstore/compare/v0.1.8...v0.2.0)

### 🚀 Enhancements

- Specify form validation schema in create/update methods to override model schema ([de40714](https://github.com/Akryum/rstore/commit/de40714))

### 💅 Refactors

- Model type => model ([2ce9c52](https://github.com/Akryum/rstore/commit/2ce9c52))

### 🏡 Chore

- Setup git hooks ([e7ceeee](https://github.com/Akryum/rstore/commit/e7ceeee))
- Allow version commit messages ([1230b69](https://github.com/Akryum/rstore/commit/1230b69))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.1.8

[compare changes](https://github.com/Akryum/rstore/compare/v0.1.7...v0.1.8)

### 🚀 Enhancements

- **vue:** Display load error in console ([6133c13](https://github.com/Akryum/rstore/commit/6133c13))

### 🩹 Fixes

- **nuxt:** Missing convertFunctionsToString ([b0ca559](https://github.com/Akryum/rstore/commit/b0ca559))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.1.7

[compare changes](https://github.com/Akryum/rstore/compare/v0.1.6...v0.1.7)

### 🚀 Enhancements

- Nuxt devtools integration ([1e7b7f3](https://github.com/Akryum/rstore/commit/1e7b7f3))

### 🩹 Fixes

- Prepare script breaking pnpm pack ([e1a10ec](https://github.com/Akryum/rstore/commit/e1a10ec))
- **nuxt:** Import useState from #app ([528e968](https://github.com/Akryum/rstore/commit/528e968))

### 🏡 Chore

- Update gitignore ([c83169b](https://github.com/Akryum/rstore/commit/c83169b))
- Remove prepack script ([ef6e01f](https://github.com/Akryum/rstore/commit/ef6e01f))

### 🤖 CI

- Nightly job tidying ([0db8905](https://github.com/Akryum/rstore/commit/0db8905))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.1.6

[compare changes](https://github.com/Akryum/rstore/compare/v0.1.5...v0.1.6)

### 🩹 Fixes

- **query:** CustomFilterOption type should be union instead of intersection ([4c362f8](https://github.com/Akryum/rstore/commit/4c362f8))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.1.5

[compare changes](https://github.com/Akryum/rstore/compare/v0.1.4...v0.1.5)

### 🩹 Fixes

- CacheFilterFirst hook setResult type ([5d9ca12](https://github.com/Akryum/rstore/commit/5d9ca12))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.1.4

[compare changes](https://github.com/Akryum/rstore/compare/v0.1.3...v0.1.4)

### 🚀 Enhancements

- CacheFilterFirst hook readItemsFromCache() ([ca57d13](https://github.com/Akryum/rstore/commit/ca57d13))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.1.3

[compare changes](https://github.com/Akryum/rstore/compare/v0.1.2...v0.1.3)

### 🩹 Fixes

- **cache:** Items not red from cache if filter is not function ([40a7ced](https://github.com/Akryum/rstore/commit/40a7ced))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.1.2

[compare changes](https://github.com/Akryum/rstore/compare/v0.1.1...v0.1.2)

### 🩹 Fixes

- **vue:** Use toRaw on cache.getState() ([4363c6f](https://github.com/Akryum/rstore/commit/4363c6f))
- **nuxt:** Missing import for markRaw ([a940213](https://github.com/Akryum/rstore/commit/a940213))

### 🏡 Chore

- Remove unused dev deps ([41d9b5a](https://github.com/Akryum/rstore/commit/41d9b5a))
- Fix dev script ([045f43f](https://github.com/Akryum/rstore/commit/045f43f))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.1.1

[compare changes](https://github.com/Akryum/rstore/compare/v0.1.0...v0.1.1)

### 🏡 Chore

- Copy readmes ([5423ac9](https://github.com/Akryum/rstore/commit/5423ac9))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

## v0.1.0


### 🚀 Enhancements

- Create store, read, plugins, cache ([aaa80ec](https://github.com/Akryum/rstore/commit/aaa80ec))
- Vue query ([6d3bccb](https://github.com/Akryum/rstore/commit/6d3bccb))
- Mutations and refactored query ([73648e2](https://github.com/Akryum/rstore/commit/73648e2))
- Mutation history ([9904eef](https://github.com/Akryum/rstore/commit/9904eef))
- Wrapped item ([db37633](https://github.com/Akryum/rstore/commit/db37633))
- Resolve relations ([7d44610](https://github.com/Akryum/rstore/commit/7d44610))
- More hooks + example devtools ([d1b5a72](https://github.com/Akryum/rstore/commit/d1b5a72))
- Computed fields ([31da02d](https://github.com/Akryum/rstore/commit/31da02d))
- Nested fetch ([c31e5c7](https://github.com/Akryum/rstore/commit/c31e5c7))
- **plugin:** AddModelDefaults ([175f402](https://github.com/Akryum/rstore/commit/175f402))
- Nuxt module ([2cc1a4c](https://github.com/Akryum/rstore/commit/2cc1a4c))

### 🩹 Fixes

- Build ([3a2e525](https://github.com/Akryum/rstore/commit/3a2e525))
- **nuxt:** Inject improvements ([690aeee](https://github.com/Akryum/rstore/commit/690aeee))

### 💅 Refactors

- Merge Vue store with core store ([cb65b83](https://github.com/Akryum/rstore/commit/cb65b83))

### 📖 Documentation

- Update README.md ([7722387](https://github.com/Akryum/rstore/commit/7722387))
- Update README.md ([f57c711](https://github.com/Akryum/rstore/commit/f57c711))
- Sponsors ([e2d6863](https://github.com/Akryum/rstore/commit/e2d6863))
- Commit convention ([98d9172](https://github.com/Akryum/rstore/commit/98d9172))
- Contributing ([92ac651](https://github.com/Akryum/rstore/commit/92ac651))
- Link to contributing guide ([f3a5ae3](https://github.com/Akryum/rstore/commit/f3a5ae3))
- Update readme ([10b29cd](https://github.com/Akryum/rstore/commit/10b29cd))
- Update logo src ([7d3bb9b](https://github.com/Akryum/rstore/commit/7d3bb9b))
- Fix logo width ([ebcf14e](https://github.com/Akryum/rstore/commit/ebcf14e))
- Fix image size ([cfc727e](https://github.com/Akryum/rstore/commit/cfc727e))

### 🏡 Chore

- Create packages ([bd61a0b](https://github.com/Akryum/rstore/commit/bd61a0b))
- Create more packages ([714910f](https://github.com/Akryum/rstore/commit/714910f))
- Vscode pin gh action ([659a487](https://github.com/Akryum/rstore/commit/659a487))
- Improved playground menu ([ff97a7e](https://github.com/Akryum/rstore/commit/ff97a7e))
- **example:** More form demo ([57bedbd](https://github.com/Akryum/rstore/commit/57bedbd))
- Logos ([fefdb6a](https://github.com/Akryum/rstore/commit/fefdb6a))
- Fix pnpm corepack ([7db8fa9](https://github.com/Akryum/rstore/commit/7db8fa9))
- Trailing space ([631b995](https://github.com/Akryum/rstore/commit/631b995))
- Create FUNDING.yml ([bdbf7d3](https://github.com/Akryum/rstore/commit/bdbf7d3))
- Bot avatar ([6ba5101](https://github.com/Akryum/rstore/commit/6ba5101))
- **example:** Fix output ssr ([9aa5cd9](https://github.com/Akryum/rstore/commit/9aa5cd9))
- Devtools fixes ([2e41515](https://github.com/Akryum/rstore/commit/2e41515))
- **playground:** Home + favicon ([2b24a04](https://github.com/Akryum/rstore/commit/2b24a04))
- Separate playground into its own workspace ([4a95611](https://github.com/Akryum/rstore/commit/4a95611))
- Add .node-version ([6636e0c](https://github.com/Akryum/rstore/commit/6636e0c))
- **playground:** Shiki client only ([3194b5a](https://github.com/Akryum/rstore/commit/3194b5a))
- **playground:** Fix get time ([8af4de9](https://github.com/Akryum/rstore/commit/8af4de9))
- Update pnpm ([171f44e](https://github.com/Akryum/rstore/commit/171f44e))
- Setup repository info ([671ed4a](https://github.com/Akryum/rstore/commit/671ed4a))
- Nuxt prepublish ([dffe83e](https://github.com/Akryum/rstore/commit/dffe83e))
- Package descriptions ([c08960c](https://github.com/Akryum/rstore/commit/c08960c))
- **playground:** Fix fetch relations ([49d094a](https://github.com/Akryum/rstore/commit/49d094a))
- Add release script ([fae6fb8](https://github.com/Akryum/rstore/commit/fae6fb8))

### ✅ Tests

- **lint:** Fix ([214da28](https://github.com/Akryum/rstore/commit/214da28))
- **ci:** Try fix ([918ecaf](https://github.com/Akryum/rstore/commit/918ecaf))
- **ci:** Revert ([c079c2a](https://github.com/Akryum/rstore/commit/c079c2a))
- **ci:** Try fix ([dec241f](https://github.com/Akryum/rstore/commit/dec241f))
- **ci:** Fix ([8dd52b2](https://github.com/Akryum/rstore/commit/8dd52b2))
- Upgrade to vitest 3 + more tests ([a62d0de](https://github.com/Akryum/rstore/commit/a62d0de))
- Store.getFetchPolicy ([dc42f16](https://github.com/Akryum/rstore/commit/dc42f16))
- More ([cf56ffb](https://github.com/Akryum/rstore/commit/cf56ffb))
- **lint:** Fix unused import ([12db4f4](https://github.com/Akryum/rstore/commit/12db4f4))
- Fix delete test ([c47a840](https://github.com/Akryum/rstore/commit/c47a840))
- **lint:** Fix ([0e45d94](https://github.com/Akryum/rstore/commit/0e45d94))

### 🤖 CI

- Release notes ([3afa0d8](https://github.com/Akryum/rstore/commit/3afa0d8))
- Pr-title ([d70d449](https://github.com/Akryum/rstore/commit/d70d449))
- Nightly ([0bb6f4b](https://github.com/Akryum/rstore/commit/0bb6f4b))
- Fix nightly releases ([4bbfcb6](https://github.com/Akryum/rstore/commit/4bbfcb6))

### ❤️ Contributors

- Guillaume Chau ([@Akryum](http://github.com/Akryum))

