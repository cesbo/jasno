<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NODE_IN_TEXT_BINDING

**error (throws)**, runtime, dev builds: a function child returned a Node.

- Message: `A function child in {ownerPath} returned <{tag}>; function children are live text.`
- Hint: Lists use each(list, { key, render }); switches use show(when, then, otherwise) or match(key, render).

<!-- /generated:catalogue -->

A function passed as a child of an element returned a DOM node. In jasno a function child is live text: its result is turned into a string every time it changes, so it cannot insert, swap or remove elements. Dev builds throw, and when this happens on a later update the error goes to the nearest `catchError` (or the router's error view).

<!-- design.md: B15.6 -->

## Fix

Keep function children for text, and switch nodes with a region:

- One of two contents depending on a condition: `show(when, then, otherwise)`.
- One of several contents by a key (a tab, a status, a component): `match(key, render)`.
- A list of nodes: `each(list, { key, render })`.
- Only text: return a string or a number, `() => user().name`.

tsc rejects a function child that returns a node, so this code usually got in through a cast or an `any` value. Remove the cast along with the fix. If the function child calls a component (`() => (ok() ? Profile() : SignIn())`), jasno throws `OWNED_IN_DERIVATION` instead, before this check. The fix is the same.

## Example

```ts no-check
import { component, h, type Read } from '@jasno/core';

declare function signIn(): void;

// Wrong: the function child returns an element
export const Header = component(function Header(p: { signedIn: Read<boolean> }): Node {
  return h.header(null, () => (p.signedIn()
    ? h.a({ href: '/account' }, 'Account')
    : h.button({ type: 'button', onclick: signIn }, 'Sign in')));
});
```

```ts
import { component, h, show, type Read } from '@jasno/core';

declare function signIn(): void;

// Right: show() swaps the nodes; the function child stays text
export const Header = component(function Header(p: { signedIn: Read<boolean> }): Node {
  return h.header(null,
    show(p.signedIn,
      () => h.a({ href: '/account' }, 'Account'),
      () => h.button({ type: 'button', onclick: signIn }, 'Sign in')),
    h.p(null, () => (p.signedIn() ? 'Signed in' : 'Guest')));
});
```

## Fixture

`test/spec/elements.test.ts` › B15.6 NODE_IN_TEXT_BINDING on a later update is routed to the nearest catchError
