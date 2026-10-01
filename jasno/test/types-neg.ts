// Type-level promises of the design: every expression marked below must be a type error
// against the public API (the design's ambient jasno.d.ts). tsc (npm run check, tsconfig.test.json) fails with TS2578
// when one of them compiles, so a loosened type cannot pass unnoticed. Not a test file: node --test never runs it.
import {
  batch, catchError, component, createContext, css, each, h, match, provide, resource, signal, useState,
  type Read, type WritableSignal,
} from '@jasno/core';
import { createRouter, route } from '@jasno/core/router';
import { mountTest } from '@jasno/core/testing';

declare const nav: HTMLElement;
declare const t: Parameters<typeof mountTest>[0];

const count = signal(0);
const title = signal('x');
const list = signal(['a']);
const Card = component(function Card(p: { title: Read<string> }): Node { return h.h2(null, p.title); });
const Page = component(function Page(): Node { return h.h1(null, 'Page'); });
const Theme = createContext<string>('Theme');
const Untyped = createContext('Untyped');
const router = createRouter([route('/', { view: async () => ({ default: Page }) })], { error: () => h.p(null, 'error'), notFound: () => h.p(null, 'not found') });

export function negatives(): void {
  // @ts-expect-error V2-01: the first argument is props or null; children come after it
  h.header(nav);
  // @ts-expect-error V2-08, TS-01: a called signal is a snapshot; data props take Read<T>
  Card({ title: title() });
  // @ts-expect-error TS-01, A01: a forgotten call: .length on a signal is message-typed
  const n: number = list.length;
  void n;
  // @ts-expect-error TS-06, S8: a match render must return something (Rendered excludes null)
  match(() => 1, () => null);
  // @ts-expect-error TS-06, S8: a catchError fallback must render something
  catchError(() => h.p(null), () => null);
  // @ts-expect-error TS-06, S8: the router's notFound must render something
  createRouter([route('/x', { view: async () => ({ default: Page }) })], { error: () => h.p(null), notFound: () => false });
  // @ts-expect-error TS-07: each needs a key
  each(list, { render: (s) => h.li(null, s) });
  // @ts-expect-error TS-08: createContext without a type argument yields a message type, not unknown
  provide(Untyped, 'x', () => h.p(null));
  // @ts-expect-error TS-09, A35: a function child is live text; returning a node is a type error that names each()
  h.div(null, () => h.span(null));
  // @ts-expect-error TS-13: a signal is not a handler
  h.button({ onclick: count }, 'x');
  // @ts-expect-error TS-03, A22: set/update are function properties, so WritableSignal is invariant
  const widened: WritableSignal<string | number> = signal('x');
  void widened;
  // @ts-expect-error R-m8, U-W6, A08: a loader resolves null, never undefined
  resource({ loader: async () => undefined });
  // @ts-expect-error A06: values read from signals are readonly
  list().push('b');
  // @ts-expect-error A09: css takes no interpolated values
  css`.a { color: ${'red'}; }`;
  // @ts-expect-error A17: open makes a non-modal dialog; call showModal()
  h.dialog({ open: true });
  // @ts-expect-error A18: void elements take no children
  h.input(null, 'x');
  // @ts-expect-error A18: textarea takes no children
  h.textarea(null, 'x');
  // @ts-expect-error A19: aria-* keys are closed
  h.div({ 'aria-lable': 'x' });
  // @ts-expect-error A27: provide's scope must render a Node
  provide(Theme, 'dark', () => {});
  // @ts-expect-error A28: match keys are primitives or components, not objects
  match(() => ({ id: 1 }), () => h.p(null));
  // @ts-expect-error S9: names from other frameworks are message-typed stubs
  useState(0);
  // @ts-expect-error S9: names from other frameworks are message-typed stubs
  batch(() => {});
  // @ts-expect-error S14, A15: router.url() cannot be changed in place
  router.url().searchParams.set('q', 'x');
  // @ts-expect-error S4: createRouter requires notFound
  createRouter([route('/y', { view: async () => ({ default: Page }) })], { error: () => h.p(null, 'error') });
  // @ts-expect-error A33: codes that mean broken code cannot be expected
  mountTest(t, () => h.p(null), { expect: ['STRICT_READ_UNTRACKED'] });
}
