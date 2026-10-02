# jasno

A TypeScript-first framework for single-page apps. Plain TypeScript, no DSL: no JSX, no template language, no build configuration. Views are typed function calls (`h.div(...)`) that tsc checks like any other code. In development the `.ts` file you edit is the module the browser runs; `jasno dist` bundles it for production.

> **Status: 0.x.** The API may change before 1.0. jasno has been exercised by agent-built apps and a comparison against React and Solid, not yet by production users, and its load times have not been measured on real phones.

## Quick start

```sh
npm create @jasno my-app
cd my-app
npm install
npm run dev
```

The Playwright tests (`npm run e2e`) need the browsers once: `npx playwright install`.

The npm package is `@jasno/core` (npm refuses the bare name `jasno` as too close to other packages); it installs the `jasno` command.

## Example

```ts
import { component, h, mount, signal } from '@jasno/core';

const Counter = component(function Counter(): Node {
  const count = signal(0);
  return h.button({ type: 'button', onclick: () => count.update((n) => n + 1) }, () => `Clicked ${count()} times`);
});

mount(Counter, document.getElementById('app'));
```

A function is live and a value is static: `() => count()` updates the text, `count()` alone would render once. Mistakes that would fail silently in other frameworks are type errors or diagnostics with a fix in the message.

## What you get

- **No build configuration.** `jasno dev` strips types as it serves, one module per file. `jasno dist` bundles with Rolldown into hashed chunks, one per lazy view, with source maps, integrity, the CSP, `_headers` and `_redirects`. npm packages are imported by name.
- **Checks.** `jasno check` runs tsc on the browser and test programs plus jasno's own rules. In development, problems are reported with a code; `npm run explain CODE` prints the repair guide.
- **Accessibility built in.** The router moves focus to each view's heading; lost focus, unnamed controls and a few other mistakes are reported.
- **Testing.** `@jasno/core/testing` mounts components under `node:test` with happy-dom; the template adds Playwright in Chromium, Firefox and WebKit.
- **Small.** The production runtime with the router is about 16 KB gzipped.

## Commands

| Command | What it does |
|---|---|
| `npm run check` | tsc for both configs plus jasno's rules |
| `npm test` | component tests with `node:test` and happy-dom |
| `npm run dev` | development server |
| `npm run dist` | production build into `dist/` |
| `npm run preview` | serves `dist/` as a static host would |
| `npm run explain CODE` | the repair guide for a diagnostic code |

## Documentation

The package carries its documentation: `AGENTS.md` (the guide, also copied into every new project) and `dist/jasno.d.ts` (the whole API, with a RECIPES block of common patterns). The design and its decisions are in [`design/`](https://github.com/cesbo/jasno/tree/HEAD/design) in the repository.

## Requirements

- Node `^24.12.0` or `>=26.0.0`
- TypeScript `~7.0.2`
- Browsers: Chrome and Edge 136+, Firefox 138+, Safari 18.4+

## Repository

- `jasno/`: the runtime, the CLI and their tests (`npm test`, `npm run check`, `npm run test:browser`, `npm run test:package`, `npm run test:template`)
- `create-jasno/`: the `npm create @jasno` template (the `@jasno/create` package)
- `design/`: the specification, the agent guide and the public types

## License

MIT
