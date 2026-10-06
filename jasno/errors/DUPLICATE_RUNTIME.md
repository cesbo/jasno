<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# DUPLICATE_RUNTIME

**error (throws)**, runtime, dev and production builds: mount() is called from a second copy of jasno, not the one that loaded first.

- Message: `Two copies of jasno are loaded: {first} and {second}.`
- Hint: Import jasno only as '@jasno/core' and never write an import map: jasno dev and jasno dist generate it.

<!-- design.md: B16.1 -->
<!-- /generated:catalogue -->

The page loaded jasno from two different URLs. Your code called `mount()` from a copy other than the one that loaded first.

Each copy has its own scheduler and owner tree. Signals, context and components from one copy would not work with the other copy. jasno refuses to mount in the dev and production builds. The message names both URLs.

## Fix

- Import jasno only by its package names: `'@jasno/core'`, `'@jasno/core/router'`, `'@jasno/core/testing'`. Never import a file inside the package (`/node_modules/@jasno/core/...`). Never import a copy from another URL.
- Never write an import map. Delete any `<script type="importmap">` from `index.html`. Keep the `<!--jasno:head-->` slot. `jasno dev` and `jasno dist` put the generated import map there. `jasno check` reports a hand-written map as `IMPORT_MAP_HANDWRITTEN`.
- Compare the two URLs in the message. One URL is what `'@jasno/core'` maps to. The other URL shows which import loads the second copy.

## Example

```ts no-check
// Wrong: a file path into the package is a second URL for jasno
import { mount } from '@jasno/core';
import { signal } from '/node_modules/@jasno/core/dist/dev.js';
```

```ts
// Right: every import names the package
import { mount, signal } from '@jasno/core';
```

## Fixture

`test/spec/elements.test.ts` › B16.1 null (and undefined) target throw MOUNT_TARGET_MISSING before the DUPLICATE_RUNTIME check
