<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# WORKER_UNSUPPORTED

**error**, reported by jasno check: new Worker, new SharedWorker or serviceWorker.register of the DOM globals in a browser file (import maps do not apply to workers, and jasno has no worker recipe).

<!-- /generated:catalogue -->

A browser file creates a `Worker` or `SharedWorker`. Or it registers a service worker with `navigator.serviceWorker.register`.

In dev, jasno resolves `@jasno/core`, your dependencies and `#imports` keys through the page's import map. Import maps do not apply to workers. So worker code cannot import them. `jasno dist` bundles only what the entry imports, so a worker file does not ship. jasno v1 has no supported way to build or ship workers.

A class of your own named `Worker` is not reported.

<!-- design.md: (c) jasno check table; (e) jasno check 3; (h) non-goals; (i) open question 5 -->

## Fix

- Do the work on the main thread. Put long computations in a `resource` loader that yields between chunks. Then new params abort a run in progress. Or move the work to the server.
- Offline caching and push notifications need a service worker. jasno v1 does not support it.

## Example

```ts
import { resource, type Read } from '@jasno/core';

declare function score(row: string): number;

// Wrong: the worker cannot resolve '@jasno/core' or any dependency
export const workerWrong = new Worker('/assets/score.js', { type: 'module' });

// Right: score in chunks on the main thread; call it in a component body
export function totalOf(rows: Read<readonly string[]>) {
  return resource({ params: () => rows(), loader: async ({ params, abortSignal }) => {
    let total = 0;
    for (const [i, row] of params.entries()) {
      total += score(row);
      if (i % 1000 === 999) { await new Promise<void>((ok) => setTimeout(() => ok(), 0)); abortSignal.throwIfAborted(); }
    }
    return total;
  } });
}
```

## Fixture

`test/cli/check.test.ts` › browser sinks: NO_HTML_SINK, USE_ROUTER (error and warn), WORKER_UNSUPPORTED, ASSET_OUTSIDE_ASSETS
