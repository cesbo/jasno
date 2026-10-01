# jasno

A TypeScript-first framework for single-page apps, designed for coding agents. Plain TypeScript, no DSL: no JSX, no template language, no bundler. Views are typed function calls (`h.div(...)`) that tsc checks like any other code, and the `.ts` file you edit is the module the browser runs.

> **Status: 0.x.** The API may change before 1.0. jasno has been exercised by agent-built apps and a comparison against React and Solid, not yet by production users, and its unbundled delivery has not been measured on real phones.

## Quick start

```sh
npm create jasno my-app
cd my-app
npm install
npx playwright install
npm run dev
```

## Example

```ts
import { component, h, mount, signal } from 'jasno';

const Counter = component(function Counter(): Node {
  const count = signal(0);
  return h.button({ type: 'button', onclick: () => count.update((n) => n + 1) }, () => `Clicked ${count()} times`);
});

mount(Counter, document.getElementById('app'));
```

A function is live and a value is static: `() => count()` updates the text, `count()` alone would render once. Mistakes that would fail silently in other frameworks are type errors or diagnostics with a fix in the message.

## What you get

- **No build step.** `jasno dev` strips types as it serves; `jasno dist` hashes files, writes the import map, `_headers` and `_redirects`. npm packages are imported by name.
- **Checks.** `jasno check` runs tsc on the browser and test programs plus jasno's own rules. In development, problems are reported with a code; `npm run explain CODE` prints the repair guide.
- **Accessibility built in.** The router moves focus to each view's heading; lost focus, unnamed controls and a few other mistakes are reported.
- **Testing.** `jasno/testing` mounts components under `node:test` with happy-dom; the template adds Playwright in Chromium, Firefox and WebKit.
- **Small.** The production runtime with the router is about 17 KB gzipped.

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

The package carries its documentation: `AGENTS.md` (the guide, also copied into every new project) and `dist/jasno.d.ts` (the whole API, with a RECIPES block of common patterns). The design and its decisions are in [`design/`](https://github.com/cesbo/jasno/tree/main/design) in the repository.

## Requirements

- Node `^24.12.0` or `>=26.0.0`
- TypeScript `~7.0.2`
- Browsers: Chrome and Edge 136+, Firefox 138+, Safari 18.4+

## Repository

- `jasno/`: the runtime, the CLI and their tests (`npm test`, `npm run check`, `npm run test:browser`, `npm run test:package`, `npm run test:template`)
- `create-jasno/`: the `npm create jasno` template
- `design/`: the specification, the agent guide and the public types

## License

MIT
