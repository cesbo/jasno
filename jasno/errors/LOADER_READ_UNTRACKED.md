<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# LOADER_READ_UNTRACKED

**warn**, runtime, dev builds: read in a loader.

- Message: `Signal "{node}" was read in the loader of resource "{resource}"; changing it will not reload.`
- Hint: Move the read into params: () => .... Use untracked() there only if a change must not reload.

<!-- design.md: B9.13 -->
<!-- /generated:catalogue -->

A resource loader read a signal before its first `await`. The loader runs untracked. Changing that signal does not reload the resource, so the results stay those of the old value.

Only `params` is tracked. The dev build warns about this read.

## Fix

- Move the read into `params`. Use the `params` that the loader receives: `params: () => query(), loader: ({ params, abortSignal }) => search(params, abortSignal)`. New params abort the old load and start a new one.
- Several inputs: return an object, `params: () => ({ q: query(), page: page() })`. Objects compare one level deep. The same values do not reload.
- A value that must not trigger a reload: read it inside `untracked()` in the loader. jasno does not warn about this.
- Reads after the first `await` are not reported. They are snapshots too.

## Example

```ts
import { component, h, resource, signal } from '@jasno/core';

declare function search(q: string, abortSignal: AbortSignal): Promise<readonly string[]>;

// Wrong: the loader reads query(); typing never reloads the results
export const SearchWrong = component(function SearchWrong(): Node {
  const query = signal('');
  const results = resource({ loader: ({ abortSignal }) => search(query(), abortSignal) });
  return h.div(null,
    h.input({ 'aria-label': 'Search', value: query, oninput: (e) => query.set(e.currentTarget.value) }),
    h.p({ role: 'status' }, () => (results.hasValue() ? `${results.value().length} results` : 'Searching')));
});

// Right: query() is read in params, so each new query loads again
export const Search = component(function Search(): Node {
  const query = signal('');
  const results = resource({ params: () => query(), loader: ({ params, abortSignal }) => search(params, abortSignal) });
  return h.div(null,
    h.input({ 'aria-label': 'Search', value: query, oninput: (e) => query.set(e.currentTarget.value) }),
    h.p({ role: 'status' }, () => (results.hasValue() ? `${results.value().length} results` : 'Searching')));
});
```

## Fixture

`test/spec/recipes.test.ts` › AGENTS claim: a loader that reads a signal reports LOADER_READ_UNTRACKED; params: () => query() is silent
