// @jasno/core/router: route table (patterns, shadowing, href), History and Navigation API adapters, the navigation
// pipeline, focus, announcement, title, scroll (design.md B17).
import { DEV } from '#dev';
import {
  Owner, abortReason, bind, brand, checkOwned, currentOwner, dispose, flush, flushId, handleError, hooks, isFlushing, ownerPath,
  rawSignal, readSignal, runSetup, signalOf, untracked, writeRaw,
} from './core.ts';
import { JasnoError, warn } from './diag.ts';
import { Region, flushFocus, focusedIn, fragmentOf, restoreFocusIn } from './dom.ts';

export type NavigateResult = 'done' | 'superseded' | 'failed';
type Params = Record<string, string>;
type Module = { readonly default: (props: never) => Node };

interface RouteOptions {
  readonly view: () => Promise<Module>;
  readonly loader?: ((ctx: { params: Params; abortSignal: AbortSignal }) => Promise<unknown>) | undefined;
  readonly title?: string | ((data: unknown) => string) | undefined;
}
interface RouteDef { readonly path: string; readonly options: RouteOptions }

// ---------------------------------------------------------------- patterns (B17.1, B17.2, B17.14)

type Param = { kind: 'param'; name: string; mod: '' | '?' | '+' | '*'; re: string | undefined; test: RegExp | undefined };
type Token = { kind: 'static'; value: string } | Param;

function invalid(path: string, reason: string, hint?: string): never {
  throw new JasnoError('INVALID_ROUTE_PATTERN', `Route pattern "${path}" is not supported: ${reason}.`,
    hint ?? "Use '/'-rooted static segments, :name, :name?, :name+, :name*, :name(a|b); for unknown URLs use createRouter(routes, { notFound }).");
}

const parsed = new Map<string, Token[]>();

function parse(path: string): Token[] {
  const cached = parsed.get(path);
  if (cached) return cached;
  if (typeof path !== 'string' || !path.startsWith('/')) invalid(String(path), 'it must start with "/"');
  const parts = path === '/' ? [] : path.slice(1).split('/');
  const seen = new Set<string>();
  const tokens = parts.map((p, i): Token => {
    if (p === '') invalid(path, 'it has an empty segment (a double or trailing slash)');
    if (!p.startsWith(':')) {
      if (/[:()*+?]/.test(p)) invalid(path, `segment "${p}" mixes text and parameter syntax`);
      return { kind: 'static', value: p };
    }
    const m = /^:([A-Za-z_$][\w$]*)(?:\((.+)\)|([?+*]))?$/.exec(p);
    if (!m) invalid(path, `segment "${p}" is not :name, :name?, :name+, :name* or :name(regex)`);
    const name = m[1]!;
    if (seen.has(name)) invalid(path, `parameter :${name} appears twice`);
    seen.add(name);
    const mod = (m[3] ?? '') as Param['mod'];
    if ((mod === '+' || mod === '*') && i !== parts.length - 1) invalid(path, `:${name}${mod} must be the last segment`);
    let test: RegExp | undefined;
    if (m[2] !== undefined) {
      // A constraint tests one whole decoded segment (B17.2).
      try { test = new RegExp(`^(?:${m[2]})$`); } catch { invalid(path, `the constraint (${m[2]}) is not a valid regular expression`); }
    }
    return { kind: 'param', name, mod, re: m[2], test };
  });
  // A pattern that matches every path, or every path but "/", replaces notFound (B17.1).
  const params = tokens.filter((t): t is Param => t.kind === 'param');
  const required = params.filter((t) => t.mod === '' || t.mod === '+').length;
  if (tokens.length && params.length === tokens.length && params.every((t) => !t.re) && params.some((t) => t.mod === '+' || t.mod === '*') && required <= 1) {
    invalid(path, 'it matches every path', 'use notFound: createRouter(routes, { error, notFound }) renders notFound for a URL no route matches.');
  }
  parsed.set(path, tokens);
  return tokens;
}

/** Decoded path segments: one trailing slash is optional; undefined when the path has broken percent-encoding. */
function segmentsOf(pathname: string): string[] | undefined {
  const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (p === '/' || p === '') return [];
  try { return p.slice(1).split('/').map(decodeURIComponent); } catch { return undefined; }
}

/** Matches tokens against decoded segments (backtracking over optional segments); case-sensitive. */
function matchTokens(tokens: Token[], segs: string[], i: number, j: number, params: Params): boolean {
  if (i === tokens.length) return j === segs.length;
  const t = tokens[i]!;
  if (t.kind === 'static') return segs[j] === t.value && matchTokens(tokens, segs, i + 1, j + 1, params);
  if (t.mod === '+' || t.mod === '*') { // last token: takes the rest, keeping '/'
    if (j < segs.length) params[t.name] = segs.slice(j).join('/');
    return t.mod === '*' || j < segs.length;
  }
  const s = segs[j];
  if (s !== undefined && s !== '' && (!t.test || t.test.test(s))) {
    params[t.name] = s;
    if (matchTokens(tokens, segs, i + 1, j + 1, params)) return true;
    delete params[t.name];
  }
  return t.mod === '?' && matchTokens(tokens, segs, i + 1, j, params);
}

// Shadowing (B17.1): expand optional segments, then compare segment by segment.
type Shape = ({ k: 'static'; v: string } | { k: 'param' } | { k: 're'; c: string } | { k: 'rest' })[];

function shapes(tokens: Token[]): Shape[] {
  let out: Shape[] = [[]];
  for (const t of tokens) {
    if (t.kind === 'static') out = out.map((s) => [...s, { k: 'static', v: t.value }]);
    else if (t.mod === '?') out = out.flatMap((s) => [s, [...s, t.re ? { k: 're', c: t.re } : { k: 'param' }]]);
    else if (t.mod === '+') out = out.map((s) => [...s, { k: 'rest' }]);
    else if (t.mod === '*') out = out.flatMap((s) => [s, [...s, { k: 'rest' }]]);
    else if (t.re !== undefined) out = out.map((s) => [...s, { k: 're', c: t.re! }]);
    else out = out.map((s) => [...s, { k: 'param' }]);
  }
  return out;
}

function covers(e: Shape, l: Shape): boolean {
  for (let i = 0; i < e.length; i++) {
    const a = e[i]!;
    if (a.k === 'rest') return i < l.length; // a splat covers the rest (one or more segments)
    const b = l[i];
    if (!b || b.k === 'rest') return false;
    if (a.k === 'static' && !(b.k === 'static' && b.v === a.v)) return false;
    if (a.k === 're' && !(b.k === 're' && b.c === a.c)) return false;
  }
  return e.length === l.length;
}

const shadows = (earlier: Token[], later: Token[]): boolean =>
  shapes(later).every((l) => shapes(earlier).some((e) => covers(e, l)));

function href(path: string, params: Record<string, unknown> = {}): string {
  const segs: string[] = [];
  for (const t of parse(path)) {
    if (t.kind === 'static') { segs.push(t.value); continue; } // as written; matching decodes (B17.2)
    const v = params[t.name];
    if (v === undefined || v === null || v === '') {
      if (t.mod === '?' || t.mod === '*') continue;
      throw new TypeError(`router.href("${path}") needs the parameter "${t.name}".`);
    }
    const s = String(v);
    segs.push(t.mod === '+' || t.mod === '*' ? s.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(s));
  }
  return '/' + segs.join('/');
}

// ---------------------------------------------------------------- router

interface Compiled { path: string; tokens: Token[]; options: RouteOptions; module: Promise<Module> | undefined }
interface Match { route: Compiled; params: Params }

function sameParams(a: Params, b: Params): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

interface Nav {
  url: URL; ac: AbortController; resolve: (r: NavigateResult) => void; done: boolean; rendered: boolean;
  promise: Promise<NavigateResult>; /** It will move focus when it renders (not the outlet's quiet first render). */ loud: boolean;
}
interface How {
  commit?: 'push' | 'replace' | undefined;
  initial?: boolean;
  pop?: boolean;
  /** Navigation API: a push or replace to a new view or params ends at the top; jasno scrolls itself, since Safari skips scroll: 'after-transition'. */
  top?: boolean;
  /** Navigation API: resolves when the browser has committed the URL (the intercept handler runs). */
  committed?: Promise<void> | undefined;
}

interface Adapter {
  start(signal: AbortSignal): void;
  stop(): void;
  /** Starts a navigation to a same-origin url and returns its result. */
  go(url: URL, replace: boolean): Promise<NavigateResult>;
  /** Whether the previous session-history entry is this app's (B17.18). */
  canGoBack(): boolean;
  back(): Promise<NavigateResult>;
}

const RELOAD_KEY = 'jasno:view-import-reload:';
/** Set around a full document navigation so the Navigation API adapter leaves it to the browser (B17.17). */
let bypass = false;

export function route(path: string, options: RouteOptions): RouteDef {
  return { path, options };
}

export function createRouter(routes: readonly RouteDef[], options: {
  error: (error: unknown, retry: () => void) => unknown;
  notFound: () => unknown;
  hash?: boolean | undefined;
}) {
  const table: Compiled[] = routes.map((r) => ({ path: r.path, tokens: parse(r.path), options: r.options, module: undefined }));
  for (let j = 1; j < table.length; j++) {
    for (let i = 0; i < j; i++) {
      if (shadows(table[i]!.tokens, table[j]!.tokens)) {
        throw new JasnoError('ROUTE_SHADOWED', `Route "${table[j]!.path}" can never match: "${table[i]!.path}" comes first and matches all of its paths.`,
          'List specific routes (/users/new) before param routes (/users/:id).');
      }
    }
  }
  const initialTitle = typeof document === 'object' ? document.title : '';

  // B17.19: inside the router a URL is the route's (its pathname is the route path); these convert at the edges.
  const hashMode = options.hash === true;
  /** The route URL of a real one: itself, or in hash mode its fragment; undefined for another document. */
  const toRoute = (u: URL): URL | undefined => {
    if (u.origin !== location.origin) return undefined;
    if (!hashMode) return u;
    if (u.pathname !== location.pathname || u.search !== location.search) return undefined;
    // Set part by part: a fragment such as //evil.example or \\evil.example stays a path on this origin.
    const [, path = '', search = '', hash = ''] = /^([^?#]*)(\?[^#]*)?(#.*)?$/s.exec(u.hash.slice(1))!;
    const r = new URL('/', location.origin);
    r.pathname = path;
    r.search = search;
    r.hash = hash;
    return r;
  };
  const toReal = (r: URL): URL => (hashMode ? new URL(`#${r.pathname}${r.search}${r.hash}`, location.href) : r);
  const here = (): URL => toRoute(new URL(location.href))!;
  /** Where navigate(to) goes: hash mode resolves a relative to (or an href() result) against the route URL. */
  const destination = (to: string): URL => {
    if (!hashMode || URL.canParse(to)) return new URL(to, location.href);
    const r = new URL(to.startsWith('#') ? to.slice(1) : to, here());
    return r.origin === location.origin ? toReal(r) : r;
  };

  const urlSig = rawSignal(typeof location === 'object' ? here() : new URL('http://localhost/'), 'router.url');
  const loading = rawSignal(false, 'router.isLoading');

  let started = false;
  let adapter: Adapter | undefined;
  let outletOwner: Owner | undefined;
  let region: Region | undefined;
  let viewOwner: Owner | undefined;
  /** The rendered view: a route with its params, or a special view. */
  let view: { route: Compiled; params: Params } | { special: 'notFound' | 'error' } | undefined;
  let current: Nav | undefined;
  let liveRegion: HTMLElement | undefined;
  let lastError: string | undefined;
  /** Focus and announcement start after the outlet's first render, unless the outlet came late (B17.3, B17.8). */
  let hasRendered = false;
  let lateOutlet = false;
  /** Set while navigate() hands a URL to the adapter: before the first render that is a redirect, and stays quiet. */
  let byCode = false;
  /** dev: the flush that disposed the outlet; another outlet() in that flush moved it (OUTLET_MOVED, B17.3). */
  let disposedInFlush = -1;

  const match = (pathname: string): Match | undefined => {
    const segs = segmentsOf(pathname);
    if (!segs) return undefined;
    for (const r of table) {
      const params: Params = {};
      if (matchTokens(r.tokens, segs, 0, 0, params)) return { route: r, params };
    }
    return undefined;
  };

  const importView = (r: Compiled): Promise<Module> => {
    r.module ??= Promise.resolve().then(() => r.options.view());
    r.module.catch(() => { r.module = undefined; });
    return r.module;
  };

  const finish = (nav: Nav, result: NavigateResult): void => {
    if (nav.done) return;
    nav.done = true;
    if (current === nav) { current = undefined; writeRaw(loading, false); }
    nav.resolve(result);
  };

  // ------------------------------------------------ rendering

  const teardownView = (): void => {
    if (viewOwner) dispose(viewOwner);
    viewOwner = undefined;
    view = undefined;
    region!.clear();
  };

  const renderSpecial = (kind: 'notFound' | 'error', fn: () => unknown): void => {
    teardownView();
    const o = new Owner(outletOwner, undefined);
    o.comp = `<view ${kind}>`;
    viewOwner = o;
    view = { special: kind };
    if (typeof document === 'object') document.title = initialTitle;
    try {
      region!.insert(runSetup(o, `<view ${kind}>`, () => fragmentOf(fn())));
    } catch (e) {
      dispose(o);
      viewOwner = undefined;
      handleError(e, outletOwner!.parent); // errors of the error and notFound views go to the next region up
    }
  };

  const renderError = (error: unknown): void => {
    lastError = error instanceof Error ? error.message : String(error);
    renderSpecial('error', () => options.error(error, retry));
  };

  const applyTitle = (title: RouteOptions['title']): void => {
    if (typeof title !== 'function') document.title = title ?? initialTitle; // a stale title never survives (B17.10)
  };

  /** Builds the route's view, new for every route and params (B17.5); throws what its setup throws. */
  const renderView = (m: Match, mod: Module, data: unknown): void => {
    teardownView();
    const o = new Owner(outletOwner, undefined);
    const label = `<view ${m.route.path}>`;
    o.comp = label;
    viewOwner = o;
    try {
      const frag = runSetup(o, label, () => {
        // The title binding comes first, so it writes document.title before the view's effects run (B17.10).
        const title = m.route.options.title;
        if (typeof title === 'function') bind(() => title(data), (t) => { document.title = String(t); }, { name: 'router title' });
        else applyTitle(title);
        const View = mod.default as unknown as (props: unknown) => unknown;
        if (typeof View !== 'function') throw new TypeError(`The module for "${m.route.path}" has no default export component.`);
        // Fixed for the view's lifetime (a new route or params builds a new view), so setup may read them.
        return fragmentOf(View({ params: () => m.params, data: () => data }));
      });
      region!.insert(frag);
      view = { route: m.route, params: m.params };
    } catch (e) {
      dispose(o);
      viewOwner = undefined;
      throw e;
    }
  };

  // ------------------------------------------------ focus, announcement (B17.8, B17.9)

  const focusView = (routePath: string): void => {
    const els = region!.nodes().filter((n): n is HTMLElement => n instanceof Element);
    const visible = (el: HTMLElement): boolean => {
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false;
      if (el.closest('dialog:not([open])')) return false;
      try { if (el.closest('[popover]:not(:popover-open)')) return false; } catch { /* engine without :popover-open */ }
      return true;
    };
    const auto = els.flatMap((e) => [...(e.matches('[autofocus]') ? [e] : []), ...e.querySelectorAll<HTMLElement>('[autofocus]')]).find(visible);
    const h1 = els.map((e) => (e.matches('h1') ? e : e.querySelector<HTMLElement>('h1'))).find(Boolean) ?? undefined;
    const main = (region!.end.parentNode as Element | null)?.closest?.('main') as HTMLElement | null;
    if (DEV && !auto && !h1) {
      warn('VIEW_NO_HEADING', `The view for "${routePath}" has no h1 or visible [autofocus]; the router focused <main>.`,
        'Render an h.h1 in every view, outside show/match (its text may be live).', { node: routePath });
    }
    for (const [el, tab] of [[auto, false], [h1, true], [main, true]] as const) {
      if (!el) continue;
      if (tab && !el.hasAttribute('tabindex')) el.tabIndex = -1;
      el.focus({ preventScroll: true });
      if (document.activeElement === el) return;
    }
  };

  const announce = (m: Match | undefined, data: unknown): void => {
    const title = m?.route.options.title;
    let text = typeof title === 'function' ? untracked(() => { try { return String(title(data)); } catch { return ''; } }) : title ?? '';
    if (!text) {
      const h1 = region!.nodes().map((n) => (n instanceof Element ? (n.matches('h1') ? n : n.querySelector('h1')) : null)).find(Boolean);
      text = h1?.textContent?.trim() ?? '';
    }
    if (!text) return;
    const body = document.body as HTMLElement & { ariaNotify?: (s: string) => void };
    if (typeof body.ariaNotify === 'function') { body.ariaNotify(text); return; }
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('style', 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap');
      document.body.append(liveRegion);
    }
    liveRegion.textContent = text;
  };

  // ------------------------------------------------ the pipeline (B17.5-B17.7, B17.12, B17.17)

  const isSearchOnly = (m: Match | undefined): boolean =>
    !!(view && 'route' in view && m && m.route === view.route && sameParams(m.params, view.params));

  const run = (url: URL, how: How): Promise<NavigateResult> => {
    const m = match(url.pathname);
    // Search- or hash-only on the same route and params (B17.7): url only, synchronously.
    if (!how.initial && isSearchOnly(m)) {
      if (current && !current.rendered) { current.ac.abort(abortReason()); finish(current, 'superseded'); }
      if (how.commit && adapter instanceof HistoryAdapter) adapter.commit(url, how.commit === 'replace');
      const hashChanged = url.hash !== urlSig.value.hash;
      writeRaw(urlSig, url);
      if (hashChanged && url.hash && !how.pop && adapter instanceof HistoryAdapter) {
        document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
      }
      return Promise.resolve('done');
    }
    if (current) { current.ac.abort(abortReason()); finish(current, 'superseded'); }
    let resolve!: (r: NavigateResult) => void;
    const promise = new Promise<NavigateResult>((r) => { resolve = r; });
    const nav: Nav = { url, ac: new AbortController(), resolve, done: false, rendered: false, promise,
      // A link click or Back before the first render is the user's and moves focus; the initial navigation and a
      // navigate() before the first render (a loader redirect, a guard) stay quiet (B17.3, B17.8).
      loud: hasRendered || lateOutlet || !(how.initial || byCode) };
    current = nav;
    if (how.commit && adapter instanceof HistoryAdapter) adapter.commit(url, how.commit === 'replace');
    writeRaw(loading, true);
    void pipeline(nav, m, how);
    return promise;
  };

  const pipeline = async (nav: Nav, m: Match | undefined, how: How): Promise<void> => {
    const quiet = !nav.loud;
    const after = (announceMatch: Match | undefined, data: unknown): void => {
      nav.rendered = true;
      flush(); // the new view's onMount callbacks and first effect runs (B17.5)
      hasRendered = true;
      if (nav.done || !outletOwner || outletOwner.state) return; // superseded or disposed during that flush
      if (!quiet) {
        focusView(m?.route.path ?? 'notFound');
        announce(announceMatch, data);
        if (adapter instanceof HistoryAdapter) adapter.scroll(how);
      }
      if (how.top) queueMicrotask(() => { flush(); if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); });
    };
    try {
      // Never render inside the caller (outlet() runs in setup, navigate() may run in an effect), and with the
      // Navigation API not before the browser committed the URL (B17.5: the URL commits first).
      await (how.committed ?? null);
      if (nav !== current) return;
      if (!m) {
        writeRaw(urlSig, nav.url);
        renderSpecial('notFound', options.notFound);
        after(undefined, undefined);
        return finish(nav, 'done');
      }
      const { route: r, params } = m;
      const signal = AbortSignal.any([nav.ac.signal, signalOf(outletOwner!)]);
      const [modR, dataR] = await Promise.allSettled([
        importView(r),
        r.options.loader ? Promise.try(r.options.loader, { params, abortSignal: signal }) : Promise.resolve(undefined),
      ]);
      if (nav !== current) return; // superseded or the outlet is gone
      if (modR.status === 'rejected' && modR.reason instanceof TypeError && !reloadedBefore(nav.url)) {
        // B17.17: usually a deploy replaced the module; one full document navigation.
        if (DEV) {
          warn('VIEW_IMPORT_FAILED', `The module for "${r.path}" failed to load (${modR.reason.message}); reloading ${nav.url.href}.`,
            'Usually a deploy replaced the files: keep previous deploys (npm run dist -- --keep 2).', { node: r.path });
        }
        markReloaded(nav.url);
        finish(nav, 'failed');
        // In hash mode the committed URL differs from the document's only in its fragment: assigning it would not reload.
        if (hashMode) location.reload();
        else fullNavigation(nav.url.href);
        return;
      }
      const failure = modR.status === 'rejected' ? modR : dataR.status === 'rejected' ? dataR : undefined;
      writeRaw(urlSig, nav.url);
      if (failure) {
        renderError(failure.reason);
        after(undefined, undefined);
        return finish(nav, 'failed');
      }
      clearReloaded(nav.url);
      const data = (dataR as PromiseFulfilledResult<unknown>).value;
      try {
        renderView(m, (modR as PromiseFulfilledResult<Module>).value, data);
      } catch (e) {
        renderError(e);
        after(undefined, undefined);
        return finish(nav, 'failed');
      }
      lastError = undefined;
      after(m, data);
      finish(nav, view && 'special' in view ? 'failed' : 'done');
    } catch (e) {
      // jasno's own failure (focus, a notFound view that threw): never reject navigate() (B17.13)
      finish(nav, 'failed');
      handleError(e, outletOwner);
    }
  };

  function retry(): void {
    if (!started) return;
    void track(run(here(), {}), 'retry');
  }

  const track = (p: Promise<NavigateResult>, what: string): Promise<NavigateResult> => {
    hooks.pending?.(p, what);
    return p;
  };

  // ------------------------------------------------ adapters

  class HistoryAdapter implements Adapter {
    index = 0;
    /** Scroll positions per history index, saved when an entry is left (B17.11). */
    positions = new Map<number, [number, number]>();
    pendingBack: { promise: Promise<NavigateResult>; resolve: (r: NavigateResult) => void } | undefined;
    target: [number, number] | undefined;
    start(signal: AbortSignal): void {
      history.scrollRestoration = 'manual';
      const st = history.state as Record<string, unknown> | null;
      this.index = typeof st?.__jasno === 'number' ? st.__jasno : 0;
      history.replaceState({ ...(st && typeof st === 'object' ? st : {}), __jasno: this.index }, '');
      document.addEventListener('click', (e) => this.onClick(e as MouseEvent), { signal });
      window.addEventListener('popstate', (e) => this.onPop(e as PopStateEvent), { signal });
      listenPreload(signal);
    }
    stop(): void {
      this.pendingBack?.resolve('superseded');
      this.pendingBack = undefined;
    }
    here = (): [number, number] => [window.scrollX ?? 0, window.scrollY ?? 0];
    onClick(e: MouseEvent): void {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a || a.hasAttribute('target') || a.hasAttribute('download')) return;
      const url = toRoute(new URL(a.getAttribute('href')!, location.href));
      // In hash mode every fragment of this document is the app's: an unmatched one renders notFound.
      if (!url || (!hashMode && !match(url.pathname))) return;
      e.preventDefault();
      void track(this.go(url, toReal(url).href === location.href), `navigation to ${url.pathname}${url.search}`);
    }
    onPop(e: PopStateEvent): void {
      const st = e.state as { __jasno?: unknown; scroll?: [number, number] } | null;
      this.positions.set(this.index, this.here()); // the entry being left, whichever way (Back or Forward)
      if (typeof st?.__jasno === 'number') this.index = st.__jasno;
      this.target = this.positions.get(this.index) ?? st?.scroll;
      // ponytail: an address-bar fragment edit adds an entry without __jasno, so index stays put; canGoBack() may then
      // say no where Back would still be the app's, and back(fallback) replaces instead of traversing.
      const p = track(run(here(), { pop: true }), 'back/forward navigation');
      const pending = this.pendingBack;
      this.pendingBack = undefined;
      if (pending) void p.then(pending.resolve);
    }
    commit(url: URL, replace: boolean): void {
      const pos = this.here();
      this.positions.set(this.index, pos);
      const st: unknown = history.state;
      history.replaceState({ ...(st && typeof st === 'object' ? st : {}), scroll: pos }, '');
      const href = toReal(url).href;
      if (replace) history.replaceState({ __jasno: this.index }, '', href);
      else history.pushState({ __jasno: ++this.index }, '', href);
    }
    /** After a new view rendered: the saved position on Back/Forward, else the top (push or replace). */
    scroll(how: How): void {
      if (typeof window.scrollTo !== 'function') return;
      const target = this.target;
      // finish() runs right after this and clears isLoading: scroll once that flush is in the DOM, as the Navigation
      // API does, so a loading bar above the view that disappears cannot shift a restored position.
      queueMicrotask(() => {
        flush();
        if (how.pop) { if (target) window.scrollTo(target[0], target[1]); }
        else window.scrollTo(0, 0);
      });
    }
    go(url: URL, replace: boolean): Promise<NavigateResult> {
      return run(url, { commit: replace ? 'replace' : 'push' });
    }
    canGoBack(): boolean {
      return this.index > 0 || !!this.pendingBack;
    }
    back(): Promise<NavigateResult> {
      if (this.pendingBack) return this.pendingBack.promise; // one step, however often it is asked for
      let resolve!: (r: NavigateResult) => void;
      const promise = new Promise<NavigateResult>((r) => { resolve = r; });
      this.pendingBack = { promise, resolve };
      history.back();
      return promise;
    }
  }

  class NavigationAdapter implements Adapter {
    nav = (globalThis as unknown as { navigation: NavigationLike }).navigation;
    last: Promise<NavigateResult> | undefined;
    force = false;
    pendingBack: { promise: Promise<NavigateResult>; resolve: (r: NavigateResult) => void } | undefined;
    start(signal: AbortSignal): void {
      this.nav.addEventListener('navigate', (e: Event) => this.onNavigate(e as NavigateEventLike), { signal });
      listenPreload(signal);
    }
    stop(): void {
      this.pendingBack?.resolve('superseded');
      this.pendingBack = undefined;
    }
    onNavigate(e: NavigateEventLike): void {
      if (!e.canIntercept || e.downloadRequest != null || e.formData || e.navigationType === 'reload' || bypass) return;
      const source = e.sourceElement;
      if (source?.closest?.('a[download]') || source?.closest?.('a[target]')) return; // left to the browser (B17.4)
      const url = new URL(e.destination.url);
      const m = match(url.pathname);
      if (!m && !this.force) return; // unmatched: the browser loads it
      const searchOnly = isSearchOnly(m);
      const traverse = e.navigationType === 'traverse';
      let commit!: () => void;
      const committed = new Promise<void>((r) => { commit = r; });
      const p = track(run(url, { pop: traverse, committed, top: !traverse && !searchOnly && !url.hash }), `navigation to ${url.pathname}${url.search}`);
      this.last = p;
      if (traverse) {
        const pending = this.pendingBack;
        this.pendingBack = undefined;
        if (pending) void p.then(pending.resolve);
      }
      e.intercept({
        focusReset: 'manual',
        scroll: searchOnly && !e.hashChange ? 'manual' : 'after-transition',
        handler: () => { commit(); return p.then(() => {}); },
      });
    }
    go(url: URL, replace: boolean): Promise<NavigateResult> {
      this.last = undefined;
      this.force = true;
      try {
        const r = this.nav.navigate(url.href, { history: replace ? 'replace' : 'push' });
        r.committed.catch(() => {});
        r.finished.catch(() => {});
      } finally { this.force = false; }
      return this.last ?? Promise.resolve('superseded');
    }
    canGoBack(): boolean {
      if (this.pendingBack) return true;
      const entries = this.nav.entries();
      const prev = this.nav.currentEntry && entries[this.nav.currentEntry.index - 1];
      // B17.18: only an entry this document created; one from an earlier page load (a typed URL, a reload) is not
      // this app's to go back to, even when a route matches it.
      const prevUrl = prev?.sameDocument && prev.url ? new URL(prev.url) : undefined;
      return !!(this.nav.canGoBack && prevUrl && prevUrl.origin === location.origin && match(prevUrl.pathname));
    }
    back(): Promise<NavigateResult> {
      if (this.pendingBack) return this.pendingBack.promise;
      let resolve!: (r: NavigateResult) => void;
      const promise = new Promise<NavigateResult>((r) => { resolve = r; });
      this.pendingBack = { promise, resolve };
      const res = this.nav.back();
      res.committed.catch(() => {});
      res.finished.catch(() => {});
      return promise;
    }
  }

  /** B17.15: intent preload of a matching link's view module. */
  const listenPreload = (signal: AbortSignal): void => {
    const preload = (e: Event): void => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a) return;
      const url = toRoute(new URL(a.getAttribute('href')!, location.href));
      const m = url ? match(url.pathname) : undefined;
      if (m) importView(m.route).catch(() => {});
    };
    document.addEventListener('pointerenter', preload, { capture: true, signal });
    document.addEventListener('focusin', preload, { signal });
  };

  // ------------------------------------------------ public members

  const notStarted = (method: string, url: string): JasnoError =>
    new JasnoError('ROUTER_NOT_STARTED', `router.${method}("${url}") was called before router.outlet() was rendered.`,
      'Mount the app first; in tests mountTest(t, () => App()) before navigate().');

  const navigate = (to: string, opts?: { replace?: boolean | undefined }): Promise<NavigateResult> => {
    if (!started) throw notStarted('navigate', to);
    const dest = destination(to);
    const url = toRoute(dest);
    if (!url) { fullNavigation(dest.href); return Promise.resolve('done'); }
    byCode = true;
    try {
      return track(adapter!.go(url, !!opts?.replace || dest.href === location.href), `navigation to ${url.pathname}${url.search}`);
    } finally { byCode = false; }
  };

  const back = (fallback: string): Promise<NavigateResult> => {
    if (!started) throw notStarted('back', fallback);
    if (adapter!.canGoBack()) return track(adapter!.back(), 'back navigation');
    return navigate(fallback, { replace: true }); // a deep link: close without leaving the app (B17.18)
  };

  const outlet = (): Node => {
    checkOwned('router.outlet()');
    if (started) {
      throw new JasnoError('OUTLET_ALREADY_ACTIVE', `router.outlet() is already rendered in ${ownerPath(outletOwner?.parent) || '<root>'}.`,
        'Render router.outlet() exactly once, in App.', { ownerPath: ownerPath(outletOwner?.parent) });
    }
    if (DEV && disposedInFlush !== -1 && disposedInFlush === flushId()) {
      warn('OUTLET_MOVED', 'router.outlet() moved within one flush: the view is built again, its loader runs again, and focus does not move.',
        'Render router.outlet() once, where it never switches; show what changes beside it (RECIPES: Layout).', { ownerPath: ownerPath(currentOwner()) });
    }
    started = true;
    hasRendered = false;
    // B17.3: swapped in by a flush that removed the focused element (a login wall replacing its form): its first
    // render focuses too. An outlet shown with focus on body (an async gate on page load) stays quiet.
    lateOutlet = isFlushing() && flushFocus()?.isConnected === false;
    const o = new Owner(currentOwner(), undefined);
    outletOwner = o;
    const r = (region = new Region());
    // The outlet is the boundary of the view's setup, bindings and effects (B17.12); it restores focus like
    // catchError does (B8.3, B8.5).
    o.boundary = (error) => {
      if (view && 'special' in view && view.special === 'error') return handleError(error, o.parent);
      const focused = focusedIn(r);
      renderError(error);
      restoreFocusIn(r, focused);
    };
    const ac = new AbortController();
    // Hash mode keeps to the History adapter: with the Navigation API a fragment change scrolls to the fragment's
    // element (none for #/users/1) instead of the top, and the History adapter scrolls itself (B17.11).
    const a = (adapter = !hashMode && 'navigation' in globalThis ? new NavigationAdapter() : new HistoryAdapter());
    a.start(ac.signal);
    o.onCleanup(() => {
      ac.abort();
      a.stop();
      if (current) { current.ac.abort(abortReason()); finish(current, 'superseded'); }
      liveRegion?.remove();
      liveRegion = undefined;
      started = false;
      if (DEV) disposedInFlush = flushId();
      view = undefined;
      viewOwner = undefined;
      writeRaw(loading, false);
    });
    // FOCUS_LOST waits for a navigation that will move focus itself (a late outlet's first render, B20.2).
    hooks.focusPending = () => (started && current?.loud ? current.promise : undefined);
    hooks.routerInfo = () => (started
      ? { url: toReal(urlSig.value).href, route: view && 'route' in view ? view.route.path : undefined, isLoading: loading.value, error: lastError }
      : undefined);
    void track(run(here(), { initial: true }), 'initial navigation');
    return r.fragment();
  };

  return {
    outlet,
    href: (path: string, params?: Record<string, unknown>) => (hashMode ? '#' : '') + href(path, params),
    navigate,
    back,
    url: brand(() => readSignal(urlSig) as URL, urlSig),
    isLoading: brand(() => readSignal(loading) as boolean, loading),
  };
}

// ---------------------------------------------------------------- full document navigations (B17.17)

function fullNavigation(url: string): void {
  bypass = true;
  try { location.assign(url); } finally { bypass = false; }
}

function reloadedBefore(url: URL): boolean {
  try { return sessionStorage.getItem(RELOAD_KEY + url.href) !== null; } catch { return false; }
}
function markReloaded(url: URL): void {
  try { sessionStorage.setItem(RELOAD_KEY + url.href, '1'); } catch { /* storage unavailable */ }
}
function clearReloaded(url: URL): void {
  try { sessionStorage.removeItem(RELOAD_KEY + url.href); } catch { /* storage unavailable */ }
}

// Minimal Navigation API shapes (lib.dom in TS 7 may lack them).
interface NavigationResultLike { committed: Promise<unknown>; finished: Promise<unknown> }
interface NavigationLike {
  addEventListener(type: 'navigate', fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  navigate(url: string, opts?: { history?: 'auto' | 'push' | 'replace' }): NavigationResultLike;
  back(): NavigationResultLike;
  entries(): { url: string | null; index: number; sameDocument: boolean }[];
  currentEntry: { index: number } | null;
  canGoBack: boolean;
}
interface NavigateEventLike extends Event {
  canIntercept: boolean;
  downloadRequest: string | null;
  formData: FormData | null;
  hashChange: boolean;
  navigationType: 'push' | 'replace' | 'reload' | 'traverse';
  destination: { url: string };
  sourceElement?: Element | null;
  intercept(opts: { handler: () => Promise<void>; focusReset?: 'manual' | 'after-transition'; scroll?: 'manual' | 'after-transition' }): void;
}
