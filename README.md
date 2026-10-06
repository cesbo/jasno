# jasno

A TypeScript-first framework for single-page apps. Plain TypeScript: no JSX, no template language, no build configuration. Views are function calls (`h.div(...)`) that TypeScript type-checks like any other code. In development, each `.ts` file is served as a module with its types removed; `jasno dist` bundles the application for production.

## Quick start

```sh
npm create @jasno my-app
cd my-app
npm install
npm run dev
```

## Example

```ts
import { component, h, mount, signal } from '@jasno/core';

const Counter = component(function Counter(): Node {
  const count = signal(0);
  return h.button(
    { type: 'button', onclick: () => count.update((n) => n + 1) },
    'Clicked ', count, ' times',
  );
});

mount(Counter, document.getElementById('app'));
```

The component body runs once. Passing `count` (or any function) as a child keeps the text live: jasno calls it again when `count` changes and updates the text node. Passing `count()` instead renders only the initial value.

Mistakes that would fail silently in other frameworks are type errors or diagnostics with a fix in the message.

## What you get

- **No build configuration.** `jasno dev` strips types as it serves, one module per file. `jasno dist` bundles with Rolldown into hashed chunks, one per lazy view, with source maps, integrity, the CSP, `_headers` and `_redirects`. npm packages are imported by name. A stylesheet in `assets/` that imports tailwindcss is compiled by the project's `@tailwindcss/cli`.
- **Checks.** `jasno check` runs tsc on the browser and test programs plus jasno's own rules. In development, problems are reported with a code; `npm run explain CODE` prints the repair guide.
- **Accessibility built in.** The router moves focus to each view's heading; lost focus, unnamed controls and a few other mistakes are reported.
- **Testing.** `@jasno/core/testing` mounts components under `node:test` with happy-dom; the template adds Playwright in Chromium, Firefox and WebKit.
- **Small.** The production runtime with the router is about 16 KB gzipped.

## Commands

| Command | What it does |
|---|---|
| `npm run check` | Type-checks the application and tests, and runs jasno's rules |
| `npm test` | Runs component tests with `node:test` and happy-dom |
| `npm run dev` | Starts the development server |
| `npm run dist` | Bundles the application for production into `dist/` |
| `npm run preview` | Serves `dist/` as a static host would |
| `npm run explain CODE` | Prints the repair guide for a diagnostic code |

## Documentation

The package includes its documentation:

- `AGENTS.md`: the guide for coding agents, also copied into every new project by `npm create @jasno`.
- `dist/jasno.d.ts`: the full API, with a RECIPES block of common patterns.

The design and its decisions are in [`design/`](https://github.com/cesbo/jasno/tree/HEAD/design) in the repository.

## Requirements

- Node `>=24.12.0`
- TypeScript `~7.0.2`
- Browsers: Chrome and Edge 136+, Firefox 138+, Safari 18.4+

## Repository

- `jasno/`: the runtime, the CLI and their tests (`npm test`, `npm run check`, `npm run test:browser`, `npm run test:package`, `npm run test:template`)
- `create-jasno/`: the `npm create @jasno` template (the `@jasno/create` package)
- `design/`: the specification, the agent guide and the public types
