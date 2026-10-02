<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NO_HTML_SINK

**error**, reported by jasno check: assignment to innerHTML/outerHTML/srcdoc, insertAdjacentHTML, document.write/writeln, also through el['innerHTML'] (blocked by the production Trusted Types CSP).

<!-- /generated:catalogue -->

Browser code writes an HTML string into the page: it assigns `innerHTML`, `outerHTML` or an iframe's `srcdoc`, or calls `insertAdjacentHTML`, `document.write` or `document.writeln`. The CSP that `jasno dist` writes requires Trusted Types and allows no policy (`require-trusted-types-for 'script'; trusted-types 'none'`), so the browser throws at that line in production; `jasno dev` sends the same policy, so it throws there too.
<!-- design.md: (c) jasno check table; (e) jasno check 3, jasno dev, jasno dist 6; ADR-34 -->

## Fix

- Build the markup with `h.*`: text children are escaped, and `h.*` returns the element to insert or return.
- Plain text: pass it as a child, or set `textContent`.
- Icons and drawings: `svg.svg({ viewBox: '0 0 24 24' }, svg.path({ d: '...' }))`.
- Emptying an element: `el.replaceChildren()` instead of `el.innerHTML = ''`.

There is no escape hatch: `trusted-types 'none'` forbids creating a policy. Reading `innerHTML` is fine.

## Example

```ts
import { h } from '@jasno/core';

// Wrong: the Trusted Types CSP rejects the string, and name is parsed as HTML
export function joinedWrong(name: string): HTMLElement {
  const p = h.p(null);
  p.innerHTML = `<b>${name}</b> joined`;
  return p;
}

// Right: build the nodes; name stays text
export function joined(name: string): HTMLElement {
  return h.p(null, h.b(null, name), ' joined');
}
```

## Fixture

`test/cli/check.test.ts` › browser sinks: NO_HTML_SINK, USE_ROUTER (error and warn), WORKER_UNSUPPORTED, ASSET_OUTSIDE_ASSETS
