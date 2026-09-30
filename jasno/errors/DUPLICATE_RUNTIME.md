<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# DUPLICATE_RUNTIME

**error (throws)**, runtime, dev and production builds: mount() is called from a second copy of jasno, not the one that loaded first.

- Message: `Two copies of jasno are loaded: {first} and {second}.`
- Hint: Import jasno only as 'jasno' and never write an import map: jasno dev and jasno dist generate it.

<!-- design.md: B16.1 -->
<!-- /generated:catalogue -->

The page loaded jasno from two different URLs, and `mount()` was called from a copy other than the one that loaded first. Each copy has its own scheduler and owner tree, so signals, context and components from one would not work with the other; jasno refuses to mount (dev and production builds). The message names both URLs.

## Fix

- Import jasno only by its package names: `'jasno'`, `'jasno/router'`, `'jasno/testing'`. Never import a file inside the package (`/node_modules/jasno/...`) or a copy from another URL.
- Never write an import map: delete any `<script type="importmap">` from `index.html` and keep the `<!--jasno:head-->` slot, where `jasno dev` and `jasno dist` put the generated one (`jasno check` reports a hand-written map as `IMPORT_MAP_HANDWRITTEN`).
- Compare the two URLs in the message: the one that is not what `'jasno'` maps to shows which import loads the second copy.

## Example

```ts no-check
// Wrong: a file path into the package is a second URL for jasno
import { mount } from 'jasno';
import { signal } from '/node_modules/jasno/dist/dev.js';
```

```ts
// Right: every import names the package
import { mount, signal } from 'jasno';
```

## Fixture

`test/spec/elements.test.ts` › B16.1 null (and undefined) target throw MOUNT_TARGET_MISSING before the DUPLICATE_RUNTIME check
