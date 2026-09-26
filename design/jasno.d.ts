// jasno v3: the complete public API as ambient module declarations (design artifact).
// Modules: 'jasno' (core), 'jasno/router', 'jasno/testing', 'jasno/testing/happy-dom'. No optional modules in v3.
// Rules this file follows: one signature per function (no overloads), every optional prop is `?: X | undefined`
// (exactOptionalPropertyTypes), element props are closed and generated from lib.dom (tools/gen-elements.cjs).
// Every snippet in the RECIPES block compiles (tools/agents-samples/recipes.ts).

/* RECIPES: patterns an agent needs that are not one function. Read with AGENTS.md.

 Forms. onsubmit fires only when every native constraint passes (required, type: 'email', pattern, min, maxLength),
   so do not re-validate in JS. Live value/checked props are assigned only when they differ: the caret stays put.
     h.form({ onsubmit: (e) => { e.preventDefault(); void save(); } },
       h.label(null, 'Email ', h.input({ type: 'email', required: true, value: email,
         oninput: (e) => { email.set(e.currentTarget.value); emailOk.set(e.currentTarget.validity.valid); } })),
       h.button({ type: 'submit', 'aria-disabled': saving }, 'Save'))       // guard with if (saving()) return
   Radio group: one signal; checked: () => plan() === 'pro', onchange: () => plan.set('pro').
   Numbers: e.currentTarget.valueAsNumber. Never disable or remove the focused element (FOCUS_LOST): keep the
   button enabled with 'aria-disabled', or move focus to the result in onMount.
   Drafts: a short-lived editor seeds its input once, value: untracked(p.card).title; a form that outlives saves
   keeps its draft in a linkedSignal whose source is the record id, not the record, so a save echo does not reset it.

 Inline edit. Enter saves through a form: implicit submission ignores IME composition and cannot activate the
   element that gets focus next. Escape cancels; leaving the field saves. In the row: const editing = signal(false);
   let refocus = false (set on the Enter/Escape paths only, so tabbing away never pulls focus back):
     show(editing, () => {
       const commit = (again: boolean) => { refocus = again; editing.set(false);
         const title = input.value.trim(); if (title && title !== p.card().title) p.onRename(title); };
       const input = h.input({ value: untracked(p.card).title, 'aria-label': 'Title',
         onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); refocus = true; editing.set(false); } },
         onblur: () => { if (editing()) commit(false); } });      // Chromium also fires blur when the input is removed
       onMount(() => { input.focus(); input.select(); });
       return h.form({ onsubmit: (e) => { e.preventDefault(); commit(true); } }, input);
     }, () => {
       const title = h.button({ type: 'button', onclick: () => editing.set(true) }, () => p.card().title);
       if (refocus) { refocus = false; onMount(() => title.focus()); }
       return title;
     })

 Mutations. Capture params before an await; afterwards write only if they are unchanged (the view stays mounted):
     async function add(text: string): Promise<void> {
       const id = p.params().id;
       await addNote(id, text);
       if (p.params().id === id) notes.reload();       // reload() refetches the CURRENT params
     }
   Optimistic saves: set() before the await. If the save fails, undo only your own change, on the current value (a
   failed reload() clears the value: never roll back by reloading). reload() only when no other save is in flight
   (its result would overwrite their optimistic values). Give the request a timeout. App-wide data lives in
   src/state.ts as export const cards = createRoot(() => resource({ loader: ... })), changed by functions there:
     let inFlight = 0;
     async function rename(id: string, title: string): Promise<void> {
       if (!cards.hasValue()) return;
       const old = cards.value().find((c) => c.id === id)?.title ?? title;
       const swap = (from: string, to: string) => { if (cards.hasValue())
         cards.set(cards.value().map((c) => (c.id === id && c.title === from ? { ...c, title: to } : c))); };
       swap(old, title); inFlight++;
       try { await saveTitle(id, title, AbortSignal.timeout(10_000)); if (inFlight === 1) cards.reload(); }
       catch { swap(title, old); toast('Not saved; your change was undone'); }
       finally { inFlight--; }
     }
   New items get their id on the client (crypto.randomUUID()), sent as the idempotency key: the saved item keeps
   its key, so its row survives the server echo, and a retry cannot create a duplicate.

 Modal dialog (never the open prop; the dialog needs a name):
     const dialog = h.dialog({ 'aria-labelledby': 'del-title',
       onclose: (e) => { if (e.currentTarget.returnValue === 'yes') void remove(); } },
       h.form({ method: 'dialog' }, h.h2({ id: 'del-title' }, 'Delete this contact?'),
         h.button({ value: 'no', autofocus: true }, 'Cancel'), h.button({ value: 'yes' }, 'Delete')));
     h.button({ type: 'button', onclick: () => dialog.showModal() }, 'Delete')
   close() returns focus to the element that opened the dialog. Removing an open dialog fires no close event and
   drops focus, so a dialog that lives in a branch opens and closes itself: onMount(() => { d.showModal(); return () => d.close(); }).
   Detail over a list (a card, a message): put it on the list's route as a search param. The list stays mounted
   (scroll, focus, drafts), Back closes the detail and deep links work; a path route would rebuild the list:
     const cardId = computed(() => router.url().searchParams.get('card'));
     match(cardId, (id) => (id === null ? '' : CardDialog({ id })))      // open it with h.a({ href: '?card=' + id }, 'Open')
     const CardDialog = component(function CardDialog(p: { id: string }): Node {
       const dialog = h.dialog({ 'aria-labelledby': 'card-title', onclose: () => {   // close also fires after Back removed it
           if (router.url().searchParams.get('card') === p.id) void router.back(router.url().pathname); } },
         h.h2({ id: 'card-title' }, 'Card ', p.id), h.form({ method: 'dialog' }, h.button(null, 'Close')));
       onMount(() => { dialog.showModal(); return () => dialog.close(); });
       return dialog;
     });
   Menus and tooltips: popover: 'auto' + popoverTargetElement on the button (top layer, light dismiss).
   Toasts: one live region that exists before messages arrive; each row owns its timer; a row that closes while it
   holds focus first hands focus to a neighbour (FOCUS_LOST otherwise):
     const region: HTMLUListElement = h.ul({ 'aria-live': 'polite', tabIndex: -1 }, each(toasts, { key: (t) => t.id,
       render: (t, _i, id) => {
         const close = () => { if (row.contains(document.activeElement))
           ((row.nextElementSibling ?? row.previousElementSibling)?.querySelector('button') ?? region).focus(); dismiss(id); };
         onMount(() => { const timer = setTimeout(close, 5000); return () => clearTimeout(timer); });
         const row = h.li(null, () => t().text, h.button({ onclick: close, 'aria-label': 'Dismiss' }, 'x'));
         return row; } }));

 Focus. A node created by a state change is focused in onMount inside its builder, never right after set().
   autofocus: true works only inside a dialog opened with showModal() and in a routed view (the router focuses it).
   Focus on change only: pass a plain boolean prop from the handler path, if (p.focus) onMount(() => el.focus()).
   A row that moves to another list focuses its new copy that way (same flush, so no FOCUS_LOST); when the row may
   vanish instead (a filter, an undo), first focus something that stays, in the handler.
   A keydown handler whose branch moves focus (directly or through a state change) calls e.preventDefault(): else
   Chromium delivers the same key's keypress to the newly focused button or link and clicks it (KEY_ACTIVATES_NEW_FOCUS).
   Enter-to-save goes through a form (Inline edit).
   A Retry button inside show(() => r.status() === 'error') disappears when clicked: focus the status line first,
   onclick: () => { status.focus(); r.reload(); } with status = h.p({ role: 'status', tabIndex: -1 }, ...).
   Status text lives in a region that exists before its text changes: h.p({ role: 'status' }, () => message()).
   Keep focus visible: no all: unset or outline: none on a control without a :focus-visible rule (FOCUS_STYLE_REMOVED).
   Routes: every view renders an h.h1 outside show/match (its text may be live). After a navigation the router runs
   the new view's onMount callbacks, then focuses its first visible [autofocus] (inside a dialog opened in onMount
   too), else its first h1, else <main>, and announces the title. App = h.header(null, nav) + h.main(null, router.outlet()).

 Polling (reload() aborts a load in flight, so schedule the next reload after the last one settled):
     const visible = signal(!document.hidden);
     onMount(({ abortSignal }) => document.addEventListener('visibilitychange',
       () => visible.set(!document.hidden), { signal: abortSignal }));
     effect(() => { if (!visible() || metrics.isLoading()) return;
       const t = setTimeout(() => metrics.reload(), 5000); return () => clearTimeout(t); });
   Debounce: await an abortable delay first in the loader; new params abort it (it never becomes an error):
     loader: async ({ params, abortSignal }) => { await delay(300, abortSignal); return search(params, abortSignal); }
     const delay = (ms: number, s: AbortSignal) => new Promise<void>((ok, fail) => {
       const t = setTimeout(ok, ms); s.addEventListener('abort', () => { clearTimeout(t); fail(s.reason); }); });
   Keep the last good value across errors (a failed load or reload() clears value()):
     linkedSignal({ source: () => (r.hasValue() ? r.value() : undefined),
       computation: (v, prev): readonly Metric[] => v ?? prev?.value ?? [] })   // annotate when reading prev
   React to a failed load inside the loader (try/catch, notify, rethrow), not in an effect on status().

 Router. Search params: const q = computed(() => router.url().searchParams.get('q') ?? '');
   change them with void router.navigate('?q=' + encodeURIComponent(v), { replace: true }) or h.a({ href: '?q=x' });
   url() updates before navigate() returns, so an input bound to q never drops keystrokes. Clear them with
   router.navigate(router.url().pathname, { replace: true }); keep them on a link: router.href(...) + router.url().search.
   Redirect (a guard, an index route): in a loader, if (!session()) { void router.navigate('/login', { replace: true }); return null; }
   (the new navigation supersedes this one, whose view never renders). On a data route type the view
   ViewProps<P, User | null>, or guard the whole app with the login wall: show(session, () => router.outlet(), () => Login()).
   Loader or resource? A route loader when the view cannot render without the data (router.isLoading, error view);
   a resource in the view when the page shows its own loading and error UI.
   After delete or create: void router.navigate(url, { replace: true }). Close a detail: void router.back('/').
   Tabs: route('/settings/:tab(profile|billing)', { view: () => import('./views/settings.ts') }) and
   match(() => p.params().tab, (tab) => ...). Per-record title: title: (user) => user.name, or no route title and
   effect(() => { document.title = name(); }) in the view (a view without a route title starts from index.html's title).
   Patterns with the same params may share one view module; otherwise one view per route, sharing a component.
   Per-param lifecycle: a view stays mounted when only its params change, so work that must restart per param
   (subscriptions, enter/leave writes, per-room state) goes in a body keyed by the param:
     match(() => p.params().roomId, (id) => RoomBody({ roomId: id }))
     // in RoomBody: const online = signal<readonly string[]>([]);
     //              onMount(() => subscribePresence(p.roomId, online.set));   // a synchronous first callback is fine
   Subscriptions whose callback sets signals go in onMount, never in effect(): a callback that fires during an effect
   run is tracked by that effect and reported (EFFECT_WRITES_STATE). State that must survive a switch (a draft per
   room) lives in a parent Map signal keyed by the param; match bodies and linkedSignal discard theirs.
   Unsaved changes: a window 'beforeunload' listener in onMount covers tab close; in-app leave guards are not in v1.
   Route tests: history.replaceState(null, '', '/users/1') before mountTest(t, () => App()), then
   await router.navigate(url); tests are the only place that touches history.
   Lazy component inside a view:
     const mod = resource({ loader: () => import('./chart.ts') });
     match(() => (mod.hasValue() ? mod.value().Chart : null), (Chart) => (Chart ? Chart({ data }) : 'Loading'))

 State and lifetime. App-wide state is a signal in a plain module (src/state.ts), never in a component module;
   app-wide data is a resource there in createRoot (Mutations). Tests share such a resource: reload() it after
   stubbing fetch. A view publishes to the shell by writing it in onMount and resetting it in the returned cleanup;
   onMount writes are fine anywhere, better one per body than one per row. Rows die when their key leaves the list
   (filtering, paging), branches when the condition flips, views on navigation: state that must survive (a running
   stopwatch, a draft) lives in the item or a parent. Writes after a component is gone are harmless.
   Timers derive time from a clock, never count ticks:
     const now = signal(Date.now());
     onMount(() => { const t = setInterval(() => now.set(Date.now()), 1000); return () => clearInterval(t); });
     const elapsed = computed(() => { const t = todo(); return t.elapsedMs + (t.startedAt === null ? 0 : now() - t.startedAt); });
   Persist: effect(() => { try { localStorage.setItem('todos', JSON.stringify(todos())); } catch { } }) also runs in the
   first flush: validate what you load before. Effects that touch other document-level state (a theme attribute)
   return a cleanup; the router resets document.title itself.
   Children that must see the parent's context, or may not render, are functions: Tabs({ tabs: [{ label, render: () => A() }] }).

 Lists and markup. Selection in O(1): const isSelected = selector(selectedId); in a row: class: { selected: () => isSelected(item().id) }.
   Repeated row controls get row-specific names: 'aria-label': () => `Remove ${todo().text}`. Selectable rows: one real
   control per row, h.button({ 'aria-pressed': () => isSelected(id) }), never tabIndex on a <tr>.
   Chat or log: h.ol({ role: 'log', 'aria-label': 'Messages' }, each(...)); merge history, pushes and your own sends
   into one list deduplicated by id (DUPLICATE_KEY warns). To stick to the bottom, measure where rows are added,
   before the write:
     const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
     messages.update((a) => [...a, m]); if (stick) { flush(); list.scrollTop = list.scrollHeight; }
   Enter-to-send in a textarea: if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
   then e.preventDefault(); form.requestSubmit(). (229 is Safari's keydown for the Enter that commits IME text.)
   Icons: svg('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' }, svg('path', { d: 'M4 12h16' })).
   Animation: CSS @starting-style + transition-behavior: allow-discrete; document.startViewTransition(() => { s.set(v); flush(); }).
   Widgets: onMount(() => { const w = makeChart(el); effect(() => w.update(data())); return () => w.destroy(); }).

 Config and backend. import config from '#config', with package.json "imports": { "#config": {
   "development": "./src/config.dev.ts", "default": "./src/config.prod.ts" } }. Everything under src/ is public:
   never put secrets there. No backend yet: the same mechanism, "#api": { "development": "./src/api.mock.ts",
   "default": "./src/api.ts" }, and import from '#api': jasno dev and npm test get the mock, jasno dist the real module.
   The mock keeps the real types:
     import type * as Api from './api.ts';
     export const listUsers: typeof Api.listUsers = async () => [{ id: '1', name: 'Ada' }];
   api.ts functions take an AbortSignal and validate res.json() (typed any) before returning it.
*/

declare module 'jasno' {
  const SIGNAL: unique symbol;
  const CONTEXT: unique symbol;
  type NotAsync<T> = T extends PromiseLike<unknown>
    ? { readonly 'jasno: must be synchronous; use resource() for async work': T }
    : unknown;
  type Truthy<T> = Exclude<T, false | 0 | 0n | '' | null | undefined>;
  /** Values read from signals are readonly: arrays (and tuples), Map and Set, so in-place mutation is a type error. */
  type Frozen<T> = T extends readonly unknown[] ? Readonly<T>
    : T extends Map<infer K, infer V> ? ReadonlyMap<K, V>
    : T extends Set<infer U> ? ReadonlySet<U>
    : T;
  /** What match() render and catchError() fallback must return (show() and each() take any Child): a node, text or a list; rendering nothing is show()'s job. */
  type Rendered = Exclude<Child, null | undefined | boolean>;
  /** match() keys are compared with Object.is: primitives or functions (components); objects would rebuild on every refetch. */
  type MatchKey = string | number | bigint | boolean | symbol | null | undefined | ((...args: never[]) => unknown);

  // ---------------------------------------------------------------- signals

  /** A zero-argument function returning the current value: the type of every live input. Pass a signal, a computed or () => expr, never a called value; p.items.length (a forgotten call) is a type error. */
  export interface Read<T> {
    (): T;
    readonly length: number | { readonly 'jasno: call it first: items().length, user().name': never };
    readonly name: string | { readonly 'jasno: call it first: items().length, user().name': never };
  }
  /** A static value or a Read<T>; element props accept it. A function is live, anything else is set once. */
  export type MaybeRead<T> = T | Read<T>;
  /** Read-only signal (computed, resource fields, router state). Call it to read; pass it uncalled to keep it live. */
  export interface Signal<T> {
    (): T;
    readonly [SIGNAL]: true;
    readonly length: { readonly 'jasno: call it first: items().length, user().name': never };
    readonly name: { readonly 'jasno: call it first: items().length, user().name': never };
  }
  /** Writable signal: s() reads, s.set(v) writes, s.update(fn) writes fn(current); writes are visible to the next read at once. set/update are bound functions. */
  export interface WritableSignal<T> extends Signal<T> {
    readonly set: (value: T) => void;
    readonly update: (fn: (value: T) => T) => void;
  }
  /** Options for signal/computed: equal decides "changed" (default Object.is; () => false always notifies); debugName names the node in diagnostics and __JASNO__. */
  export interface SignalOptions<T> {
    readonly equal?: ((a: T, b: T) => boolean) | undefined;
    readonly debugName?: string | undefined;
  }
  /** Creates writable state; arrays, Maps and Sets read back readonly: replace them (items.update((a) => [...a, x])), never mutate. Generic code storing a type parameter writes signal<T, T>(initial). */
  export function signal<T, V extends T | Frozen<T> = Frozen<T>>(initial: T, options?: SignalOptions<V>): WritableSignal<V>;
  /** Lazy cached derivation; must be pure and synchronous (a write inside throws WRITE_IN_DERIVATION; async is a type error). */
  export function computed<T>(fn: () => T & NotAsync<T>, options?: SignalOptions<T>): Signal<T>;
  /** linkedSignal options: holds computation(source(), previous) and recomputes it only when source()'s value changes (Object.is); set() overrides it until then. source is any Read (a signal, a computed, () => x); computation runs untracked; annotate its return type when it reads previous. */
  export interface LinkedSignalOptions<S, T> {
    readonly source: Read<S>;
    readonly computation: (source: S, previous: { readonly source: S; readonly value: T } | undefined) => T;
    readonly equal?: ((a: T, b: T) => boolean) | undefined;
    readonly debugName?: string | undefined;
  }
  /** Writable state that resets when an input changes: linkedSignal({ source: p.userId, computation: () => '' }). Use it instead of an effect that copies state. */
  export function linkedSignal<S, T>(options: LinkedSignalOptions<S, T>): WritableSignal<T>;
  /** Runs fn without tracking and returns its result. Only for values that must never update (a seed); it is not a way to silence STRICT_READ_UNTRACKED. untracked(count) works too. */
  export function untracked<T>(fn: () => T): T;
  /** Applies pending DOM updates (and, outside a flush, pending effects) now; otherwise they run on the next microtask. For tests, layout measuring and document.startViewTransition(() => { s.set(v); flush(); }). */
  export function flush(): void;
  /** O(1) selection for lists: const isSelected = selector(selectedId); a row's () => isSelected(item().id) re-runs only when its own answer flips. */
  export function selector<K>(source: Read<K>): (key: K) => boolean;

  // ---------------------------------------------------------------- effects and ownership

  /** Function returned from an effect/onMount callback; runs once, before the next run and on disposal. */
  export type Cleanup = () => void;
  /** Argument of effect/onMount callbacks; abortSignal aborts before the next run and on disposal: give it to fetch() and addEventListener(). */
  export interface EffectContext {
    readonly abortSignal: AbortSignal;
  }
  /** Syncs the outside world (document.title, localStorage, a widget) with signals: runs in the first flush, then after what it read changes, after DOM updates (rows and branches built in the same flush included). Never set signals here, not even from a callback that fires during the run (derive with computed/linkedSignal; subscribe in onMount). Returns stop(). */
  export function effect(fn: (ctx: EffectContext) => void | Cleanup, options?: { readonly debugName?: string | undefined }): () => void;
  /** Runs fn once, untracked, after the current component's, branch's or row's nodes are inserted (also on first render): window/document listeners, subscriptions (their callbacks may set signals), timers, focus, measuring, widgets. Return a cleanup or use abortSignal. */
  export function onMount(fn: (ctx: EffectContext) => void | Cleanup): void;
  /** Owner for work that lives as long as the app outside any component, e.g. export const session = createRoot(() => resource({ ... })) in src/state.ts; dispose() ends it early. Tests share it (it is never reset or reported as leaked). */
  export function createRoot<T>(fn: (dispose: () => void) => T): T;

  // ---------------------------------------------------------------- async

  /** 'idle' params() is undefined; 'loading' first load or new params (no value); 'reloading' reload() with the value kept; 'resolved'; 'error' a load or reload() failed (no value; value() throws); 'local' after set(). Gate content on hasValue(), spinners on isLoading(). */
  export type ResourceStatus = 'idle' | 'loading' | 'reloading' | 'resolved' | 'error' | 'local';
  /** What a loader receives: the params value and an abortSignal, aborted when params change, on reload()/set() and on disposal. */
  export interface ResourceLoaderContext<P> {
    readonly params: P;
    readonly abortSignal: AbortSignal;
  }
  /** resource() options: params is tracked and synchronous, any Read (undefined = idle; omitted = load once); loader is async and untracked (read signals in params, not in the loader). */
  export interface ResourceOptions<T, P> {
    readonly params?: (() => P | undefined) | undefined;
    readonly loader: (ctx: ResourceLoaderContext<P>) => Promise<T>;
    readonly debugName?: string | undefined;
  }
  /** Async value bound to params: new params abort the old load and clear the value; stale results are dropped. All members are bound. */
  export interface Resource<T> {
    /** Loaded value; undefined while idle/loading; kept while reloading; throws the loader's error while status() is 'error': guard with hasValue(). */
    readonly value: Signal<T | undefined>;
    readonly status: Signal<ResourceStatus>;
    /** The loader's error while status() is 'error', otherwise undefined. */
    readonly error: Signal<unknown>;
    /** True while status() is 'loading' or 'reloading'. */
    readonly isLoading: Signal<boolean>;
    /** Tracked read: true when value() has a value ('resolved', 'local', or 'reloading' with a value); narrows value() to T. Use it instead of value()!. */
    hasValue(): this is LoadedResource<T>;
    /** Refetches the current params, keeping the value (status 'reloading'); aborts a load in flight; no-op while idle. Its result replaces set() values, optimistic ones of saves still in flight included; if it fails the value is gone (status 'error'). */
    readonly reload: () => void;
    /** Replaces the value now (status 'local') and aborts a load in flight. Optimistic: set() before the await; after an await only if params are unchanged (undo a failed save this way, never by reload()). In 'loading' (no value yet) it warns RESOURCE_SET_WHILE_LOADING. */
    readonly set: (value: T) => void;
  }
  /** A Resource narrowed by hasValue(): value() returns T. */
  export interface LoadedResource<T> extends Resource<T> {
    readonly value: Signal<T>;
  }
  /** Async state: resource({ params: () => p.id(), loader: ({ params, abortSignal }) => getUser(params, abortSignal) }). The loader resolves null, never undefined or void, for "no data". */
  export function resource<T extends {} | null, P = unknown>(options: ResourceOptions<T, P>): Resource<Frozen<T>>;

  // ---------------------------------------------------------------- components and DOM

  /** Values rendered as text: strings and numbers print; null, undefined and booleans render nothing. */
  export type TextChild = string | number | bigint | boolean | null | undefined;
  /** A function child is live TEXT; returning nodes is a type error (lists use each(), switches use show() or match()). */
  export type LiveText = Read<TextChild | { readonly 'jasno: a function child is live text; lists use each(), switches use show() or match()': never }>;
  /** Anything accepted as a child of h.* or svg() or returned by show/match/each callbacks. */
  export type Child = Node | TextChild | LiveText | readonly Child[];
  /** Type of on<event> props: event.currentTarget is the element (capture it before any await); a signal is rejected, so onclick: count is a type error. */
  export type Handler<Ev, E> = ((event: Ev & { readonly currentTarget: E }) => void) & {
    readonly [SIGNAL]?: { readonly 'jasno: a signal is not a handler; write () => count.set(...)': never };
  };
  /** Wraps a component: component(function Card(p: CardProps): Node { ... }), named and annotated. The body runs once, untracked, under its own owner; call it directly: Card({ ... }). */
  export function component<A extends [] | [props: unknown] | [props?: unknown]>(fn: (...args: A) => Node): (...args: A) => Node;
  /** Element factories: h.div(props | null, ...children) returns the real element. Props are closed; function values are live except on<event> handlers. */
  export const h: H;
  /** Attributes of svg(): any attribute name, set with setAttribute (live when a function); on<event> handlers get a plain Event. */
  export interface SvgAttributes {
    readonly [attribute: string]: MaybeRead<string | number | null | undefined> | ((event: Event) => void);
  }
  /** SVG elements with open attributes: svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: 'M4 12h16' })). */
  export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: SvgAttributes | null, ...children: Child[]): SVGElementTagNameMap[K];
  /** Renders then(value) while when() is truthy, else otherwise(); rebuilt only when truthiness flips (everything created inside dies then). value is a live Read of the narrowed value. */
  export function show<T>(when: Read<T>, then: (value: Read<Truthy<T>>) => Child, otherwise?: () => Child): Node;
  /** Rebuilds its region whenever key() changes (Object.is): tabs, status switches, dynamic components. Keys are primitives or components; render must return something for every key. */
  export function match<K extends MatchKey>(key: Read<K>, render: (key: K) => Rendered): Node;
  /** each() options: key returns the item's stable id; render builds one row, once per key (item and index are live Reads, key is a plain value). */
  export interface EachOptions<T, K extends string | number> {
    readonly key: (item: T, index: number) => K;
    readonly render: (item: Read<T>, index: Read<number>, key: K) => Child;
  }
  /** Keyed list: each(todos, { key: (t) => t.id, render: (todo) => h.li(null, () => todo().text) }). A row lives while its key is in the list; same key with a new object updates it in place; a repeated key warns DUPLICATE_KEY (deduplicate merged sources by id). */
  export function each<T, K extends string | number>(list: Read<readonly T[]>, options: EachOptions<T, K>): Node;
  /** Error boundary: renders tryFn(); if it or anything under it (setup, bindings, effects) throws, disposes it and renders fallback(error, reset); reset() re-runs tryFn from scratch. */
  export function catchError(tryFn: () => Child, fallback: (error: unknown, reset: () => void) => Rendered): Node;
  /** App entry, once in src/main.ts: mount(App, document.getElementById('app')) replaces the target's children and returns unmount(); a null target throws MOUNT_TARGET_MISSING. */
  export function mount(view: () => Node, target: Element | null): () => void;
  /** Adopts a global stylesheet once per call site, at module top level. No ${} values (use style: { '--x': ... }); prefix rules with the component's class, which you put on its root yourself. */
  export function css(strings: TemplateStringsArray): CSSStyleSheet;
  type CssProperty = Exclude<
    { [K in keyof CSSStyleDeclaration]: K extends string ? (CSSStyleDeclaration[K] extends string ? K : never) : never }[keyof CSSStyleDeclaration],
    'cssText' | 'cssFloat'
  >;
  /** style prop: camelCase CSS properties and --custom properties, each a string or a Read (null/undefined removes). Numbers are rejected: write '0.5', '12px'. */
  export type StyleProps = { readonly [K in CssProperty]?: MaybeRead<string | null | undefined> | undefined } & {
    readonly [custom: `--${string}`]: MaybeRead<string | null | undefined> | undefined;
  };

  // ---------------------------------------------------------------- context

  /** Typed context key created by createContext; carries T for provide/useContext. */
  export interface Context<T> {
    readonly name: string;
    readonly [CONTEXT]?: T;
  }
  /** Creates a context key; name the type: createContext<Theme>('Theme'). Without a default value, useContext throws NO_PROVIDER when nothing provides it. */
  export function createContext<T = { readonly 'jasno: name the type: createContext<T>(name)': never }>(name: string, ...defaultValue: [] | [value: T]): Context<T>;
  /** Makes value visible to useContext in everything fn creates (now and later: branches, rows, effects) and returns fn's node. The value is static: provide signals for live data. */
  export function provide<T>(context: Context<T>, value: NoInfer<T>, fn: () => Node): Node;
  /** Returns the nearest provided value. Needs a current owner: call it in setup and keep the result in a const (handlers and code after await have no owner). */
  export function useContext<T>(context: Context<T>): T;

  // ---------------------------------------------------------------- names from other frameworks (type-level only; not exported at runtime)

  /** Not in jasno: writes already apply at once and the DOM updates on the next microtask; flush() applies it now. */
  export const batch: { readonly 'jasno: no batch(); writes apply at once, the DOM updates on the next microtask, flush() applies now': never };
  /** Not in jasno: use signal(initial), read s(), write s.set(v). */
  export const createSignal: { readonly 'jasno: use signal(initial): s() reads, s.set(v) writes': never };
  /** Not in jasno: use signal(initial), read s(), write s.set(v). */
  export const useState: { readonly 'jasno: use signal(initial): s() reads, s.set(v) writes': never };
  /** Not in jasno: use computed(fn). */
  export const createMemo: { readonly 'jasno: use computed(fn)': never };
  /** Not in jasno: use computed(fn); effects only sync the outside world. */
  export const useMemo: { readonly 'jasno: use computed(fn)': never };
  /** Not in jasno: use effect(fn) (no dependency array; it tracks what it reads) or onMount(fn) for one-time work. */
  export const createEffect: { readonly 'jasno: use effect(fn) (it tracks what it reads) or onMount(fn) for one-time work': never };
  /** Not in jasno: use effect(fn) (no dependency array; it tracks what it reads) or onMount(fn) for one-time work. */
  export const useEffect: { readonly 'jasno: use effect(fn) (it tracks what it reads) or onMount(fn) for one-time work': never };
  /** Not in jasno: use resource({ params, loader }). */
  export const createResource: { readonly 'jasno: use resource({ params, loader })': never };
  /** Not in jasno: h.* returns the element; keep it in a const. */
  export const useRef: { readonly 'jasno: no refs; h.* returns the element: const input = h.input(...)': never };
  /** Not in jasno: h.* returns the element; keep it in a const. */
  export const ref: { readonly 'jasno: no refs; h.* returns the element: const input = h.input(...)': never };
  /** Not in jasno: return a cleanup from onMount/effect: onMount(() => () => socket.close()). */
  export const onCleanup: { readonly 'jasno: return a cleanup from onMount or effect: onMount(() => () => socket.close())': never };
  /** Not in jasno: return a cleanup from onMount/effect: onMount(() => () => socket.close()). */
  export const onDestroy: { readonly 'jasno: return a cleanup from onMount or effect: onMount(() => () => socket.close())': never };
  /** Not in jasno: mount(App, document.getElementById('app')). */
  export const render: { readonly "jasno: use mount(App, document.getElementById('app'))": never };
  /** Not in jasno: each(list, { key, render }). */
  export const For: { readonly 'jasno: use each(list, { key: (x) => x.id, render: (x) => row })': never };
  /** Not in jasno: show(when, then, otherwise). */
  export const Show: { readonly 'jasno: use show(when, then, otherwise)': never };

  // ---------------------------------------------------------------- diagnostics and dev introspection

  /** Stable runtime diagnostic codes (the CLI adds its own); the repair guide is node_modules/jasno/errors/CODE.md. */
  export type DiagnosticCode =
    | 'WRITE_IN_DERIVATION' | 'EFFECT_LOOP' | 'NO_PROVIDER' | 'CONTEXT_OUTSIDE_OWNER' | 'DUPLICATE_RUNTIME'
    | 'MOUNT_TARGET_MISSING' | 'FLUSH_REENTRANT' | 'OWNED_IN_DERIVATION'
    | 'SIGNAL_COERCED' | 'NODE_IN_TEXT_BINDING' | 'PENDING_READ_UNTRACKED' | 'COMPONENT_RETURN_NOT_NODE'
    | 'STRICT_READ_UNTRACKED' | 'LOADER_READ_UNTRACKED' | 'UNTRACKED_IN_DERIVATION' | 'EFFECT_WRITES_STATE'
    | 'EFFECT_NO_DEPS' | 'NO_OWNER' | 'WRITE_IN_SETUP' | 'LEAK_IN_SETUP' | 'RESOURCE_SET_WHILE_LOADING'
    | 'DUPLICATE_KEY' | 'UNSTABLE_KEY' | 'UNKNOWN_PROP' | 'NODE_MOVED' | 'NODE_OUTSIDE_REGION'
    | 'INTERACTIVE_NO_NAME' | 'FOCUS_LOST' | 'KEY_ACTIVATES_NEW_FOCUS' | 'SUBMIT_NOT_PREVENTED'
    | 'INVALID_ROUTE_PATTERN' | 'ROUTE_SHADOWED' | 'OUTLET_ALREADY_ACTIVE' | 'ROUTER_NOT_STARTED'
    | 'VIEW_NO_HEADING' | 'VIEW_IMPORT_FAILED'
    | 'EFFECT_LEAKED' | 'EXPECTED_DIAGNOSTIC_MISSING' | 'SETTLE_TIMEOUT' | 'UNCAUGHT_ERROR' | 'TESTING_REQUIRES_DEV_BUILD';
  /** One deduplicated diagnostic event; message starts with "[CODE]" and is self-contained. */
  export interface Diagnostic {
    readonly code: DiagnosticCode;
    readonly severity: 'error' | 'warn' | 'info';
    readonly message: string;
    readonly hint: string;
    /** Repair guide shipped in the package, e.g. node_modules/jasno/errors/STRICT_READ_UNTRACKED.md. */
    readonly docs: string;
    /** Owner path where it happened, e.g. "<App> › <UserList> › each row". */
    readonly ownerPath: string;
    /** debugName (or kind#id) of the signal/computed/effect involved. */
    readonly node?: string | undefined;
    /** First user stack frame, e.g. "src/views/user.ts:42:17" (dev builds capture it lazily). */
    readonly loc?: string | undefined;
    /** Occurrences of this (code, region, node, loc) so far. */
    readonly count: number;
  }
  /** A node of the reactive graph as reported by __JASNO__.graph(). */
  export interface GraphNode {
    readonly id: number;
    readonly kind: 'signal' | 'computed' | 'linkedSignal' | 'effect' | 'binding' | 'resource' | 'selector';
    readonly name: string;
    readonly ownerPath: string;
    /** Short preview of the current value (JSON, truncated to 80 chars). */
    readonly value?: string | undefined;
    readonly runs?: number | undefined;
    readonly loc?: string | undefined;
  }
  /** Result of __JASNO__.inspect(): a graph node with its edges, or an element with its owner path and bindings. */
  export interface InspectResult {
    readonly kind: GraphNode['kind'] | 'element';
    readonly name: string;
    readonly ownerPath: string;
    readonly value?: string | undefined;
    readonly sources: readonly string[];
    readonly observers: readonly string[];
    readonly runs?: number | undefined;
    readonly loc?: string | undefined;
    /** For an element: its live bindings as "prop ← node" strings. */
    readonly bindings?: readonly string[] | undefined;
  }
  /** window.__JASNO__ in dev builds (undefined in production): the stable text interface for agents and Playwright scripts. */
  export interface FFDevtools {
    readonly version: string;
    diagnostics(filter?: { readonly code?: DiagnosticCode | undefined; readonly severity?: Diagnostic['severity'] | undefined }): readonly Diagnostic[];
    clearDiagnostics(): void;
    graph(filter?: { readonly ownerPath?: string | undefined; readonly name?: string | undefined }): {
      readonly nodes: readonly GraphNode[];
      readonly edges: readonly { readonly consumer: number; readonly producer: number }[];
    };
    /** A graph node by id or debugName, or a DOM node (its owner path, e.g. "<App> › <UserList> › each row", and bindings). */
    inspect(target: number | string | Node): InspectResult | undefined;
    /** Why a node last ran: the chain from the triggering write, e.g. ["count.set at src/a.ts:9:5", "double", "binding p#text"]. */
    why(target: number | string): readonly string[] | undefined;
    router(): { readonly url: string; readonly route: string | undefined; readonly isLoading: boolean; readonly error: string | undefined } | undefined;
  }

  // <generated:elements> from lib.dom.d.ts (TypeScript 7.0.2) by tools/gen-elements.cjs (v2); do not edit by hand
  /** Props every h.* element accepts: class, style, data-/aria- attributes, lowercase on<event> handlers and writable HTMLElement properties (value or Read<T>). */
  export interface GlobalProps<E extends HTMLElement> {
    class?: string | Read<string | undefined> | { readonly [name: string]: boolean | Read<boolean> } | undefined;
    style?: StyleProps | undefined;
    [attribute: `data-${string}`]: MaybeRead<string | number | boolean | null | undefined>;
    'aria-activedescendant'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-atomic'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-autocomplete'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-braillelabel'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-brailleroledescription'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-busy'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-checked'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-colcount'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-colindex'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-colindextext'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-colspan'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-controls'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-current'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-describedby'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-description'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-details'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-disabled'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-errormessage'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-expanded'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-flowto'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-haspopup'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-hidden'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-invalid'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-keyshortcuts'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-label'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-labelledby'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-level'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-live'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-modal'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-multiline'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-multiselectable'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-orientation'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-owns'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-placeholder'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-posinset'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-pressed'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-readonly'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-relevant'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-required'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-roledescription'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-rowcount'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-rowindex'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-rowindextext'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-rowspan'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-selected'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-setsize'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-sort'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-valuemax'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-valuemin'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-valuenow'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-valuetext'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    className?: { readonly "jasno: use class, not className": never } | undefined;
    for?: { readonly "jasno: use htmlFor (the DOM property), not for": never } | undefined;
    ref?: { readonly "jasno: no refs: keep the element, const input = h.input(...)": never } | undefined;
    key?: { readonly "jasno: keys go in each(list, { key, render })": never } | undefined;
    children?: { readonly "jasno: pass children after props: h.div(null, a, b)": never } | undefined;
    innerHTML?: { readonly "jasno: not allowed (Trusted Types); build nodes with h.* and text children": never } | undefined;
    onfullscreenchange?: Handler<HTMLElementEventMap['fullscreenchange'], E> | undefined;
    onfullscreenerror?: Handler<HTMLElementEventMap['fullscreenerror'], E> | undefined;
    onabort?: Handler<HTMLElementEventMap['abort'], E> | undefined;
    onanimationcancel?: Handler<HTMLElementEventMap['animationcancel'], E> | undefined;
    onanimationend?: Handler<HTMLElementEventMap['animationend'], E> | undefined;
    onanimationiteration?: Handler<HTMLElementEventMap['animationiteration'], E> | undefined;
    onanimationstart?: Handler<HTMLElementEventMap['animationstart'], E> | undefined;
    onauxclick?: Handler<HTMLElementEventMap['auxclick'], E> | undefined;
    onbeforeinput?: Handler<HTMLElementEventMap['beforeinput'], E> | undefined;
    onbeforematch?: Handler<HTMLElementEventMap['beforematch'], E> | undefined;
    onbeforetoggle?: Handler<HTMLElementEventMap['beforetoggle'], E> | undefined;
    onblur?: Handler<HTMLElementEventMap['blur'], E> | undefined;
    oncancel?: Handler<HTMLElementEventMap['cancel'], E> | undefined;
    oncanplay?: Handler<HTMLElementEventMap['canplay'], E> | undefined;
    oncanplaythrough?: Handler<HTMLElementEventMap['canplaythrough'], E> | undefined;
    onchange?: Handler<HTMLElementEventMap['change'], E> | undefined;
    onclick?: Handler<HTMLElementEventMap['click'], E> | undefined;
    onclose?: Handler<HTMLElementEventMap['close'], E> | undefined;
    oncommand?: Handler<HTMLElementEventMap['command'], E> | undefined;
    oncompositionend?: Handler<HTMLElementEventMap['compositionend'], E> | undefined;
    oncompositionstart?: Handler<HTMLElementEventMap['compositionstart'], E> | undefined;
    oncompositionupdate?: Handler<HTMLElementEventMap['compositionupdate'], E> | undefined;
    oncontextlost?: Handler<HTMLElementEventMap['contextlost'], E> | undefined;
    oncontextmenu?: Handler<HTMLElementEventMap['contextmenu'], E> | undefined;
    oncontextrestored?: Handler<HTMLElementEventMap['contextrestored'], E> | undefined;
    oncopy?: Handler<HTMLElementEventMap['copy'], E> | undefined;
    oncuechange?: Handler<HTMLElementEventMap['cuechange'], E> | undefined;
    oncut?: Handler<HTMLElementEventMap['cut'], E> | undefined;
    ondblclick?: Handler<HTMLElementEventMap['dblclick'], E> | undefined;
    ondrag?: Handler<HTMLElementEventMap['drag'], E> | undefined;
    ondragend?: Handler<HTMLElementEventMap['dragend'], E> | undefined;
    ondragenter?: Handler<HTMLElementEventMap['dragenter'], E> | undefined;
    ondragleave?: Handler<HTMLElementEventMap['dragleave'], E> | undefined;
    ondragover?: Handler<HTMLElementEventMap['dragover'], E> | undefined;
    ondragstart?: Handler<HTMLElementEventMap['dragstart'], E> | undefined;
    ondrop?: Handler<HTMLElementEventMap['drop'], E> | undefined;
    ondurationchange?: Handler<HTMLElementEventMap['durationchange'], E> | undefined;
    onemptied?: Handler<HTMLElementEventMap['emptied'], E> | undefined;
    onended?: Handler<HTMLElementEventMap['ended'], E> | undefined;
    onerror?: Handler<HTMLElementEventMap['error'], E> | undefined;
    onfocus?: Handler<HTMLElementEventMap['focus'], E> | undefined;
    onfocusin?: Handler<HTMLElementEventMap['focusin'], E> | undefined;
    onfocusout?: Handler<HTMLElementEventMap['focusout'], E> | undefined;
    onformdata?: Handler<HTMLElementEventMap['formdata'], E> | undefined;
    ongotpointercapture?: Handler<HTMLElementEventMap['gotpointercapture'], E> | undefined;
    oninput?: Handler<HTMLElementEventMap['input'], E> | undefined;
    oninvalid?: Handler<HTMLElementEventMap['invalid'], E> | undefined;
    onkeydown?: Handler<HTMLElementEventMap['keydown'], E> | undefined;
    onkeypress?: Handler<HTMLElementEventMap['keypress'], E> | undefined;
    onkeyup?: Handler<HTMLElementEventMap['keyup'], E> | undefined;
    onload?: Handler<HTMLElementEventMap['load'], E> | undefined;
    onloadeddata?: Handler<HTMLElementEventMap['loadeddata'], E> | undefined;
    onloadedmetadata?: Handler<HTMLElementEventMap['loadedmetadata'], E> | undefined;
    onloadstart?: Handler<HTMLElementEventMap['loadstart'], E> | undefined;
    onlostpointercapture?: Handler<HTMLElementEventMap['lostpointercapture'], E> | undefined;
    onmousedown?: Handler<HTMLElementEventMap['mousedown'], E> | undefined;
    onmouseenter?: Handler<HTMLElementEventMap['mouseenter'], E> | undefined;
    onmouseleave?: Handler<HTMLElementEventMap['mouseleave'], E> | undefined;
    onmousemove?: Handler<HTMLElementEventMap['mousemove'], E> | undefined;
    onmouseout?: Handler<HTMLElementEventMap['mouseout'], E> | undefined;
    onmouseover?: Handler<HTMLElementEventMap['mouseover'], E> | undefined;
    onmouseup?: Handler<HTMLElementEventMap['mouseup'], E> | undefined;
    onpaste?: Handler<HTMLElementEventMap['paste'], E> | undefined;
    onpause?: Handler<HTMLElementEventMap['pause'], E> | undefined;
    onplay?: Handler<HTMLElementEventMap['play'], E> | undefined;
    onplaying?: Handler<HTMLElementEventMap['playing'], E> | undefined;
    onpointercancel?: Handler<HTMLElementEventMap['pointercancel'], E> | undefined;
    onpointerdown?: Handler<HTMLElementEventMap['pointerdown'], E> | undefined;
    onpointerenter?: Handler<HTMLElementEventMap['pointerenter'], E> | undefined;
    onpointerleave?: Handler<HTMLElementEventMap['pointerleave'], E> | undefined;
    onpointermove?: Handler<HTMLElementEventMap['pointermove'], E> | undefined;
    onpointerout?: Handler<HTMLElementEventMap['pointerout'], E> | undefined;
    onpointerover?: Handler<HTMLElementEventMap['pointerover'], E> | undefined;
    onpointerrawupdate?: Handler<HTMLElementEventMap['pointerrawupdate'], E> | undefined;
    onpointerup?: Handler<HTMLElementEventMap['pointerup'], E> | undefined;
    onprogress?: Handler<HTMLElementEventMap['progress'], E> | undefined;
    onratechange?: Handler<HTMLElementEventMap['ratechange'], E> | undefined;
    onreset?: Handler<HTMLElementEventMap['reset'], E> | undefined;
    onresize?: Handler<HTMLElementEventMap['resize'], E> | undefined;
    onscroll?: Handler<HTMLElementEventMap['scroll'], E> | undefined;
    onscrollend?: Handler<HTMLElementEventMap['scrollend'], E> | undefined;
    onsecuritypolicyviolation?: Handler<HTMLElementEventMap['securitypolicyviolation'], E> | undefined;
    onseeked?: Handler<HTMLElementEventMap['seeked'], E> | undefined;
    onseeking?: Handler<HTMLElementEventMap['seeking'], E> | undefined;
    onselect?: Handler<HTMLElementEventMap['select'], E> | undefined;
    onselectionchange?: Handler<HTMLElementEventMap['selectionchange'], E> | undefined;
    onselectstart?: Handler<HTMLElementEventMap['selectstart'], E> | undefined;
    onslotchange?: Handler<HTMLElementEventMap['slotchange'], E> | undefined;
    onstalled?: Handler<HTMLElementEventMap['stalled'], E> | undefined;
    onsubmit?: Handler<HTMLElementEventMap['submit'], E> | undefined;
    onsuspend?: Handler<HTMLElementEventMap['suspend'], E> | undefined;
    ontimeupdate?: Handler<HTMLElementEventMap['timeupdate'], E> | undefined;
    ontoggle?: Handler<HTMLElementEventMap['toggle'], E> | undefined;
    ontouchcancel?: Handler<HTMLElementEventMap['touchcancel'], E> | undefined;
    ontouchend?: Handler<HTMLElementEventMap['touchend'], E> | undefined;
    ontouchmove?: Handler<HTMLElementEventMap['touchmove'], E> | undefined;
    ontouchstart?: Handler<HTMLElementEventMap['touchstart'], E> | undefined;
    ontransitioncancel?: Handler<HTMLElementEventMap['transitioncancel'], E> | undefined;
    ontransitionend?: Handler<HTMLElementEventMap['transitionend'], E> | undefined;
    ontransitionrun?: Handler<HTMLElementEventMap['transitionrun'], E> | undefined;
    ontransitionstart?: Handler<HTMLElementEventMap['transitionstart'], E> | undefined;
    onvolumechange?: Handler<HTMLElementEventMap['volumechange'], E> | undefined;
    onwaiting?: Handler<HTMLElementEventMap['waiting'], E> | undefined;
    onwebkitanimationend?: Handler<HTMLElementEventMap['webkitanimationend'], E> | undefined;
    onwebkitanimationiteration?: Handler<HTMLElementEventMap['webkitanimationiteration'], E> | undefined;
    onwebkitanimationstart?: Handler<HTMLElementEventMap['webkitanimationstart'], E> | undefined;
    onwebkittransitionend?: Handler<HTMLElementEventMap['webkittransitionend'], E> | undefined;
    onwheel?: Handler<HTMLElementEventMap['wheel'], E> | undefined;
    accessKey?: MaybeRead<E['accessKey'] | undefined> | undefined;
    autocapitalize?: MaybeRead<E['autocapitalize'] | undefined> | undefined;
    autocorrect?: MaybeRead<E['autocorrect'] | undefined> | undefined;
    dir?: MaybeRead<E['dir'] | undefined> | undefined;
    draggable?: MaybeRead<E['draggable'] | undefined> | undefined;
    hidden?: MaybeRead<E['hidden'] | undefined> | undefined;
    inert?: MaybeRead<E['inert'] | undefined> | undefined;
    lang?: MaybeRead<E['lang'] | undefined> | undefined;
    popover?: MaybeRead<E['popover'] | undefined> | undefined;
    spellcheck?: MaybeRead<E['spellcheck'] | undefined> | undefined;
    title?: MaybeRead<E['title'] | undefined> | undefined;
    translate?: MaybeRead<E['translate'] | undefined> | undefined;
    writingSuggestions?: MaybeRead<E['writingSuggestions'] | undefined> | undefined;
    id?: MaybeRead<E['id'] | undefined> | undefined;
    slot?: MaybeRead<E['slot'] | undefined> | undefined;
    role?: MaybeRead<E['role'] | undefined> | undefined;
    contentEditable?: MaybeRead<E['contentEditable'] | undefined> | undefined;
    enterKeyHint?: MaybeRead<E['enterKeyHint'] | undefined> | undefined;
    inputMode?: MaybeRead<E['inputMode'] | undefined> | undefined;
    autofocus?: MaybeRead<E['autofocus'] | undefined> | undefined;
    tabIndex?: MaybeRead<E['tabIndex'] | undefined> | undefined;
  }
  /** Props for h.a (HTMLAnchorElement). */
  export interface HTMLAnchorElementProps extends GlobalProps<HTMLAnchorElement> {
    download?: MaybeRead<HTMLAnchorElement['download'] | undefined> | undefined;
    hreflang?: MaybeRead<HTMLAnchorElement['hreflang'] | undefined> | undefined;
    ping?: MaybeRead<HTMLAnchorElement['ping'] | undefined> | undefined;
    referrerPolicy?: MaybeRead<HTMLAnchorElement['referrerPolicy'] | undefined> | undefined;
    rel?: MaybeRead<HTMLAnchorElement['rel'] | undefined> | undefined;
    target?: MaybeRead<HTMLAnchorElement['target'] | undefined> | undefined;
    type?: MaybeRead<HTMLAnchorElement['type'] | undefined> | undefined;
    href?: MaybeRead<HTMLAnchorElement['href'] | undefined> | undefined;
  }
  /** Props for h.abbr and every other tag whose element is a plain HTMLElement (HTMLElement). */
  export interface HTMLElementProps extends GlobalProps<HTMLElement> {}
  /** Props for h.area (HTMLAreaElement). */
  export interface HTMLAreaElementProps extends GlobalProps<HTMLAreaElement> {
    alt?: MaybeRead<HTMLAreaElement['alt'] | undefined> | undefined;
    coords?: MaybeRead<HTMLAreaElement['coords'] | undefined> | undefined;
    download?: MaybeRead<HTMLAreaElement['download'] | undefined> | undefined;
    ping?: MaybeRead<HTMLAreaElement['ping'] | undefined> | undefined;
    referrerPolicy?: MaybeRead<HTMLAreaElement['referrerPolicy'] | undefined> | undefined;
    rel?: MaybeRead<HTMLAreaElement['rel'] | undefined> | undefined;
    shape?: MaybeRead<HTMLAreaElement['shape'] | undefined> | undefined;
    target?: MaybeRead<HTMLAreaElement['target'] | undefined> | undefined;
    href?: MaybeRead<HTMLAreaElement['href'] | undefined> | undefined;
  }
  /** Props for h.audio (HTMLAudioElement). */
  export interface HTMLAudioElementProps extends GlobalProps<HTMLAudioElement> {
    autoplay?: MaybeRead<HTMLAudioElement['autoplay'] | undefined> | undefined;
    controls?: MaybeRead<HTMLAudioElement['controls'] | undefined> | undefined;
    crossOrigin?: MaybeRead<HTMLAudioElement['crossOrigin'] | undefined> | undefined;
    currentTime?: MaybeRead<HTMLAudioElement['currentTime'] | undefined> | undefined;
    defaultMuted?: MaybeRead<HTMLAudioElement['defaultMuted'] | undefined> | undefined;
    defaultPlaybackRate?: MaybeRead<HTMLAudioElement['defaultPlaybackRate'] | undefined> | undefined;
    disableRemotePlayback?: MaybeRead<HTMLAudioElement['disableRemotePlayback'] | undefined> | undefined;
    loop?: MaybeRead<HTMLAudioElement['loop'] | undefined> | undefined;
    muted?: MaybeRead<HTMLAudioElement['muted'] | undefined> | undefined;
    playbackRate?: MaybeRead<HTMLAudioElement['playbackRate'] | undefined> | undefined;
    preload?: MaybeRead<HTMLAudioElement['preload'] | undefined> | undefined;
    preservesPitch?: MaybeRead<HTMLAudioElement['preservesPitch'] | undefined> | undefined;
    src?: MaybeRead<HTMLAudioElement['src'] | undefined> | undefined;
    srcObject?: MaybeRead<HTMLAudioElement['srcObject'] | undefined> | undefined;
    volume?: MaybeRead<HTMLAudioElement['volume'] | undefined> | undefined;
    onencrypted?: Handler<HTMLMediaElementEventMap['encrypted'], HTMLAudioElement> | undefined;
    onwaitingforkey?: Handler<HTMLMediaElementEventMap['waitingforkey'], HTMLAudioElement> | undefined;
  }
  /** Props for h.blockquote (HTMLQuoteElement). */
  export interface HTMLQuoteElementProps extends GlobalProps<HTMLQuoteElement> {
    cite?: MaybeRead<HTMLQuoteElement['cite'] | undefined> | undefined;
  }
  /** Props for h.br (HTMLBRElement). */
  export interface HTMLBRElementProps extends GlobalProps<HTMLBRElement> {}
  /** Props for h.button (HTMLButtonElement). */
  export interface HTMLButtonElementProps extends GlobalProps<HTMLButtonElement> {
    command?: MaybeRead<HTMLButtonElement['command'] | undefined> | undefined;
    commandForElement?: MaybeRead<HTMLButtonElement['commandForElement'] | undefined> | undefined;
    disabled?: MaybeRead<HTMLButtonElement['disabled'] | undefined> | undefined;
    formAction?: MaybeRead<HTMLButtonElement['formAction'] | undefined> | undefined;
    formEnctype?: MaybeRead<HTMLButtonElement['formEnctype'] | undefined> | undefined;
    formMethod?: MaybeRead<HTMLButtonElement['formMethod'] | undefined> | undefined;
    formNoValidate?: MaybeRead<HTMLButtonElement['formNoValidate'] | undefined> | undefined;
    formTarget?: MaybeRead<HTMLButtonElement['formTarget'] | undefined> | undefined;
    name?: MaybeRead<HTMLButtonElement['name'] | undefined> | undefined;
    type?: MaybeRead<HTMLButtonElement['type'] | undefined> | undefined;
    value?: MaybeRead<HTMLButtonElement['value'] | undefined> | undefined;
    popoverTargetAction?: MaybeRead<HTMLButtonElement['popoverTargetAction'] | undefined> | undefined;
    popoverTargetElement?: MaybeRead<HTMLButtonElement['popoverTargetElement'] | undefined> | undefined;
  }
  /** Props for h.canvas (HTMLCanvasElement). */
  export interface HTMLCanvasElementProps extends GlobalProps<HTMLCanvasElement> {
    height?: MaybeRead<HTMLCanvasElement['height'] | undefined> | undefined;
    width?: MaybeRead<HTMLCanvasElement['width'] | undefined> | undefined;
  }
  /** Props for h.caption (HTMLTableCaptionElement). */
  export interface HTMLTableCaptionElementProps extends GlobalProps<HTMLTableCaptionElement> {}
  /** Props for h.col (HTMLTableColElement). */
  export interface HTMLTableColElementProps extends GlobalProps<HTMLTableColElement> {
    span?: MaybeRead<HTMLTableColElement['span'] | undefined> | undefined;
  }
  /** Props for h.data (HTMLDataElement). */
  export interface HTMLDataElementProps extends GlobalProps<HTMLDataElement> {
    value?: MaybeRead<HTMLDataElement['value'] | undefined> | undefined;
  }
  /** Props for h.datalist (HTMLDataListElement). */
  export interface HTMLDataListElementProps extends GlobalProps<HTMLDataListElement> {}
  /** Props for h.del (HTMLModElement). */
  export interface HTMLModElementProps extends GlobalProps<HTMLModElement> {
    cite?: MaybeRead<HTMLModElement['cite'] | undefined> | undefined;
    dateTime?: MaybeRead<HTMLModElement['dateTime'] | undefined> | undefined;
  }
  /** Props for h.details (HTMLDetailsElement). */
  export interface HTMLDetailsElementProps extends GlobalProps<HTMLDetailsElement> {
    name?: MaybeRead<HTMLDetailsElement['name'] | undefined> | undefined;
    open?: MaybeRead<HTMLDetailsElement['open'] | undefined> | undefined;
  }
  /** Props for h.dialog (HTMLDialogElement). */
  export interface HTMLDialogElementProps extends GlobalProps<HTMLDialogElement> {
    closedBy?: MaybeRead<HTMLDialogElement['closedBy'] | undefined> | undefined;
    open?: { readonly "jasno: open makes a NON-modal dialog; call el.showModal() in a handler and el.close() to close": never } | undefined;
    returnValue?: MaybeRead<HTMLDialogElement['returnValue'] | undefined> | undefined;
  }
  /** Props for h.div (HTMLDivElement). */
  export interface HTMLDivElementProps extends GlobalProps<HTMLDivElement> {}
  /** Props for h.dl (HTMLDListElement). */
  export interface HTMLDListElementProps extends GlobalProps<HTMLDListElement> {}
  /** Props for h.fieldset (HTMLFieldSetElement). */
  export interface HTMLFieldSetElementProps extends GlobalProps<HTMLFieldSetElement> {
    disabled?: MaybeRead<HTMLFieldSetElement['disabled'] | undefined> | undefined;
    name?: MaybeRead<HTMLFieldSetElement['name'] | undefined> | undefined;
  }
  /** Props for h.form (HTMLFormElement). */
  export interface HTMLFormElementProps extends GlobalProps<HTMLFormElement> {
    acceptCharset?: MaybeRead<HTMLFormElement['acceptCharset'] | undefined> | undefined;
    action?: MaybeRead<HTMLFormElement['action'] | undefined> | undefined;
    autocomplete?: MaybeRead<HTMLFormElement['autocomplete'] | undefined> | undefined;
    encoding?: MaybeRead<HTMLFormElement['encoding'] | undefined> | undefined;
    enctype?: MaybeRead<HTMLFormElement['enctype'] | undefined> | undefined;
    method?: MaybeRead<HTMLFormElement['method'] | undefined> | undefined;
    name?: MaybeRead<HTMLFormElement['name'] | undefined> | undefined;
    noValidate?: MaybeRead<HTMLFormElement['noValidate'] | undefined> | undefined;
    rel?: MaybeRead<HTMLFormElement['rel'] | undefined> | undefined;
    target?: MaybeRead<HTMLFormElement['target'] | undefined> | undefined;
  }
  /** Props for h.h1 (HTMLHeadingElement). */
  export interface HTMLHeadingElementProps extends GlobalProps<HTMLHeadingElement> {}
  /** Props for h.hr (HTMLHRElement). */
  export interface HTMLHRElementProps extends GlobalProps<HTMLHRElement> {}
  /** Props for h.iframe (HTMLIFrameElement). */
  export interface HTMLIFrameElementProps extends GlobalProps<HTMLIFrameElement> {
    allow?: MaybeRead<HTMLIFrameElement['allow'] | undefined> | undefined;
    allowFullscreen?: MaybeRead<HTMLIFrameElement['allowFullscreen'] | undefined> | undefined;
    height?: MaybeRead<HTMLIFrameElement['height'] | undefined> | undefined;
    loading?: MaybeRead<HTMLIFrameElement['loading'] | undefined> | undefined;
    name?: MaybeRead<HTMLIFrameElement['name'] | undefined> | undefined;
    referrerPolicy?: MaybeRead<HTMLIFrameElement['referrerPolicy'] | undefined> | undefined;
    sandbox?: MaybeRead<string | undefined> | undefined;
    src?: MaybeRead<HTMLIFrameElement['src'] | undefined> | undefined;
    width?: MaybeRead<HTMLIFrameElement['width'] | undefined> | undefined;
  }
  /** Props for h.img (HTMLImageElement). */
  export interface HTMLImageElementProps extends GlobalProps<HTMLImageElement> {
    alt?: MaybeRead<HTMLImageElement['alt'] | undefined> | undefined;
    crossOrigin?: MaybeRead<HTMLImageElement['crossOrigin'] | undefined> | undefined;
    decoding?: MaybeRead<HTMLImageElement['decoding'] | undefined> | undefined;
    fetchPriority?: MaybeRead<HTMLImageElement['fetchPriority'] | undefined> | undefined;
    height?: MaybeRead<HTMLImageElement['height'] | undefined> | undefined;
    isMap?: MaybeRead<HTMLImageElement['isMap'] | undefined> | undefined;
    loading?: MaybeRead<HTMLImageElement['loading'] | undefined> | undefined;
    referrerPolicy?: MaybeRead<HTMLImageElement['referrerPolicy'] | undefined> | undefined;
    sizes?: MaybeRead<HTMLImageElement['sizes'] | undefined> | undefined;
    src?: MaybeRead<HTMLImageElement['src'] | undefined> | undefined;
    srcset?: MaybeRead<HTMLImageElement['srcset'] | undefined> | undefined;
    useMap?: MaybeRead<HTMLImageElement['useMap'] | undefined> | undefined;
    width?: MaybeRead<HTMLImageElement['width'] | undefined> | undefined;
  }
  /** Props for h.input (HTMLInputElement). */
  export interface HTMLInputElementProps extends GlobalProps<HTMLInputElement> {
    accept?: MaybeRead<HTMLInputElement['accept'] | undefined> | undefined;
    alt?: MaybeRead<HTMLInputElement['alt'] | undefined> | undefined;
    autocomplete?: MaybeRead<HTMLInputElement['autocomplete'] | undefined> | undefined;
    capture?: MaybeRead<HTMLInputElement['capture'] | undefined> | undefined;
    checked?: MaybeRead<HTMLInputElement['checked'] | undefined> | undefined;
    defaultChecked?: MaybeRead<HTMLInputElement['defaultChecked'] | undefined> | undefined;
    defaultValue?: MaybeRead<HTMLInputElement['defaultValue'] | undefined> | undefined;
    dirName?: MaybeRead<HTMLInputElement['dirName'] | undefined> | undefined;
    disabled?: MaybeRead<HTMLInputElement['disabled'] | undefined> | undefined;
    files?: MaybeRead<HTMLInputElement['files'] | undefined> | undefined;
    formAction?: MaybeRead<HTMLInputElement['formAction'] | undefined> | undefined;
    formEnctype?: MaybeRead<HTMLInputElement['formEnctype'] | undefined> | undefined;
    formMethod?: MaybeRead<HTMLInputElement['formMethod'] | undefined> | undefined;
    formNoValidate?: MaybeRead<HTMLInputElement['formNoValidate'] | undefined> | undefined;
    formTarget?: MaybeRead<HTMLInputElement['formTarget'] | undefined> | undefined;
    height?: MaybeRead<HTMLInputElement['height'] | undefined> | undefined;
    indeterminate?: MaybeRead<HTMLInputElement['indeterminate'] | undefined> | undefined;
    max?: MaybeRead<HTMLInputElement['max'] | undefined> | undefined;
    maxLength?: MaybeRead<HTMLInputElement['maxLength'] | undefined> | undefined;
    min?: MaybeRead<HTMLInputElement['min'] | undefined> | undefined;
    minLength?: MaybeRead<HTMLInputElement['minLength'] | undefined> | undefined;
    multiple?: MaybeRead<HTMLInputElement['multiple'] | undefined> | undefined;
    name?: MaybeRead<HTMLInputElement['name'] | undefined> | undefined;
    pattern?: MaybeRead<HTMLInputElement['pattern'] | undefined> | undefined;
    placeholder?: MaybeRead<HTMLInputElement['placeholder'] | undefined> | undefined;
    readOnly?: MaybeRead<HTMLInputElement['readOnly'] | undefined> | undefined;
    required?: MaybeRead<HTMLInputElement['required'] | undefined> | undefined;
    selectionDirection?: MaybeRead<HTMLInputElement['selectionDirection'] | undefined> | undefined;
    selectionEnd?: MaybeRead<HTMLInputElement['selectionEnd'] | undefined> | undefined;
    selectionStart?: MaybeRead<HTMLInputElement['selectionStart'] | undefined> | undefined;
    size?: MaybeRead<HTMLInputElement['size'] | undefined> | undefined;
    src?: MaybeRead<HTMLInputElement['src'] | undefined> | undefined;
    step?: MaybeRead<HTMLInputElement['step'] | undefined> | undefined;
    type?: MaybeRead<HTMLInputElement['type'] | undefined> | undefined;
    value?: MaybeRead<HTMLInputElement['value'] | undefined> | undefined;
    valueAsDate?: MaybeRead<HTMLInputElement['valueAsDate'] | undefined> | undefined;
    valueAsNumber?: MaybeRead<HTMLInputElement['valueAsNumber'] | undefined> | undefined;
    webkitdirectory?: MaybeRead<HTMLInputElement['webkitdirectory'] | undefined> | undefined;
    width?: MaybeRead<HTMLInputElement['width'] | undefined> | undefined;
    popoverTargetAction?: MaybeRead<HTMLInputElement['popoverTargetAction'] | undefined> | undefined;
    popoverTargetElement?: MaybeRead<HTMLInputElement['popoverTargetElement'] | undefined> | undefined;
  }
  /** Props for h.label (HTMLLabelElement). */
  export interface HTMLLabelElementProps extends GlobalProps<HTMLLabelElement> {
    htmlFor?: MaybeRead<HTMLLabelElement['htmlFor'] | undefined> | undefined;
  }
  /** Props for h.legend (HTMLLegendElement). */
  export interface HTMLLegendElementProps extends GlobalProps<HTMLLegendElement> {}
  /** Props for h.li (HTMLLIElement). */
  export interface HTMLLIElementProps extends GlobalProps<HTMLLIElement> {
    value?: MaybeRead<HTMLLIElement['value'] | undefined> | undefined;
  }
  /** Props for h.map (HTMLMapElement). */
  export interface HTMLMapElementProps extends GlobalProps<HTMLMapElement> {
    name?: MaybeRead<HTMLMapElement['name'] | undefined> | undefined;
  }
  /** Props for h.menu (HTMLMenuElement). */
  export interface HTMLMenuElementProps extends GlobalProps<HTMLMenuElement> {}
  /** Props for h.meter (HTMLMeterElement). */
  export interface HTMLMeterElementProps extends GlobalProps<HTMLMeterElement> {
    high?: MaybeRead<HTMLMeterElement['high'] | undefined> | undefined;
    low?: MaybeRead<HTMLMeterElement['low'] | undefined> | undefined;
    max?: MaybeRead<HTMLMeterElement['max'] | undefined> | undefined;
    min?: MaybeRead<HTMLMeterElement['min'] | undefined> | undefined;
    optimum?: MaybeRead<HTMLMeterElement['optimum'] | undefined> | undefined;
    value?: MaybeRead<HTMLMeterElement['value'] | undefined> | undefined;
  }
  /** Props for h.ol (HTMLOListElement). */
  export interface HTMLOListElementProps extends GlobalProps<HTMLOListElement> {
    reversed?: MaybeRead<HTMLOListElement['reversed'] | undefined> | undefined;
    start?: MaybeRead<HTMLOListElement['start'] | undefined> | undefined;
    type?: MaybeRead<HTMLOListElement['type'] | undefined> | undefined;
  }
  /** Props for h.optgroup (HTMLOptGroupElement). */
  export interface HTMLOptGroupElementProps extends GlobalProps<HTMLOptGroupElement> {
    disabled?: MaybeRead<HTMLOptGroupElement['disabled'] | undefined> | undefined;
    label?: MaybeRead<HTMLOptGroupElement['label'] | undefined> | undefined;
  }
  /** Props for h.option (HTMLOptionElement). */
  export interface HTMLOptionElementProps extends GlobalProps<HTMLOptionElement> {
    defaultSelected?: MaybeRead<HTMLOptionElement['defaultSelected'] | undefined> | undefined;
    disabled?: MaybeRead<HTMLOptionElement['disabled'] | undefined> | undefined;
    label?: MaybeRead<HTMLOptionElement['label'] | undefined> | undefined;
    selected?: MaybeRead<HTMLOptionElement['selected'] | undefined> | undefined;
    value?: MaybeRead<HTMLOptionElement['value'] | undefined> | undefined;
  }
  /** Props for h.output (HTMLOutputElement). */
  export interface HTMLOutputElementProps extends GlobalProps<HTMLOutputElement> {
    defaultValue?: MaybeRead<HTMLOutputElement['defaultValue'] | undefined> | undefined;
    htmlFor?: MaybeRead<string | undefined> | undefined;
    name?: MaybeRead<HTMLOutputElement['name'] | undefined> | undefined;
    value?: MaybeRead<HTMLOutputElement['value'] | undefined> | undefined;
  }
  /** Props for h.p (HTMLParagraphElement). */
  export interface HTMLParagraphElementProps extends GlobalProps<HTMLParagraphElement> {}
  /** Props for h.picture (HTMLPictureElement). */
  export interface HTMLPictureElementProps extends GlobalProps<HTMLPictureElement> {}
  /** Props for h.pre (HTMLPreElement). */
  export interface HTMLPreElementProps extends GlobalProps<HTMLPreElement> {}
  /** Props for h.progress (HTMLProgressElement). */
  export interface HTMLProgressElementProps extends GlobalProps<HTMLProgressElement> {
    max?: MaybeRead<HTMLProgressElement['max'] | undefined> | undefined;
    value?: MaybeRead<HTMLProgressElement['value'] | undefined> | undefined;
  }
  /** Props for h.select (HTMLSelectElement). */
  export interface HTMLSelectElementProps extends GlobalProps<HTMLSelectElement> {
    autocomplete?: MaybeRead<HTMLSelectElement['autocomplete'] | undefined> | undefined;
    disabled?: MaybeRead<HTMLSelectElement['disabled'] | undefined> | undefined;
    multiple?: MaybeRead<HTMLSelectElement['multiple'] | undefined> | undefined;
    name?: MaybeRead<HTMLSelectElement['name'] | undefined> | undefined;
    required?: MaybeRead<HTMLSelectElement['required'] | undefined> | undefined;
    selectedIndex?: MaybeRead<HTMLSelectElement['selectedIndex'] | undefined> | undefined;
    size?: MaybeRead<HTMLSelectElement['size'] | undefined> | undefined;
    value?: MaybeRead<HTMLSelectElement['value'] | undefined> | undefined;
  }
  /** Props for h.source (HTMLSourceElement). */
  export interface HTMLSourceElementProps extends GlobalProps<HTMLSourceElement> {
    height?: MaybeRead<HTMLSourceElement['height'] | undefined> | undefined;
    media?: MaybeRead<HTMLSourceElement['media'] | undefined> | undefined;
    sizes?: MaybeRead<HTMLSourceElement['sizes'] | undefined> | undefined;
    src?: MaybeRead<HTMLSourceElement['src'] | undefined> | undefined;
    srcset?: MaybeRead<HTMLSourceElement['srcset'] | undefined> | undefined;
    type?: MaybeRead<HTMLSourceElement['type'] | undefined> | undefined;
    width?: MaybeRead<HTMLSourceElement['width'] | undefined> | undefined;
  }
  /** Props for h.span (HTMLSpanElement). */
  export interface HTMLSpanElementProps extends GlobalProps<HTMLSpanElement> {}
  /** Props for h.table (HTMLTableElement). */
  export interface HTMLTableElementProps extends GlobalProps<HTMLTableElement> {
    caption?: MaybeRead<HTMLTableElement['caption'] | undefined> | undefined;
    tFoot?: MaybeRead<HTMLTableElement['tFoot'] | undefined> | undefined;
    tHead?: MaybeRead<HTMLTableElement['tHead'] | undefined> | undefined;
  }
  /** Props for h.tbody (HTMLTableSectionElement). */
  export interface HTMLTableSectionElementProps extends GlobalProps<HTMLTableSectionElement> {}
  /** Props for h.td (HTMLTableCellElement). */
  export interface HTMLTableCellElementProps extends GlobalProps<HTMLTableCellElement> {
    abbr?: MaybeRead<HTMLTableCellElement['abbr'] | undefined> | undefined;
    colSpan?: MaybeRead<HTMLTableCellElement['colSpan'] | undefined> | undefined;
    headers?: MaybeRead<HTMLTableCellElement['headers'] | undefined> | undefined;
    rowSpan?: MaybeRead<HTMLTableCellElement['rowSpan'] | undefined> | undefined;
    scope?: MaybeRead<HTMLTableCellElement['scope'] | undefined> | undefined;
  }
  /** Props for h.textarea (HTMLTextAreaElement). */
  export interface HTMLTextAreaElementProps extends GlobalProps<HTMLTextAreaElement> {
    autocomplete?: MaybeRead<HTMLTextAreaElement['autocomplete'] | undefined> | undefined;
    cols?: MaybeRead<HTMLTextAreaElement['cols'] | undefined> | undefined;
    defaultValue?: MaybeRead<HTMLTextAreaElement['defaultValue'] | undefined> | undefined;
    dirName?: MaybeRead<HTMLTextAreaElement['dirName'] | undefined> | undefined;
    disabled?: MaybeRead<HTMLTextAreaElement['disabled'] | undefined> | undefined;
    maxLength?: MaybeRead<HTMLTextAreaElement['maxLength'] | undefined> | undefined;
    minLength?: MaybeRead<HTMLTextAreaElement['minLength'] | undefined> | undefined;
    name?: MaybeRead<HTMLTextAreaElement['name'] | undefined> | undefined;
    placeholder?: MaybeRead<HTMLTextAreaElement['placeholder'] | undefined> | undefined;
    readOnly?: MaybeRead<HTMLTextAreaElement['readOnly'] | undefined> | undefined;
    required?: MaybeRead<HTMLTextAreaElement['required'] | undefined> | undefined;
    rows?: MaybeRead<HTMLTextAreaElement['rows'] | undefined> | undefined;
    selectionDirection?: MaybeRead<HTMLTextAreaElement['selectionDirection'] | undefined> | undefined;
    selectionEnd?: MaybeRead<HTMLTextAreaElement['selectionEnd'] | undefined> | undefined;
    selectionStart?: MaybeRead<HTMLTextAreaElement['selectionStart'] | undefined> | undefined;
    value?: MaybeRead<HTMLTextAreaElement['value'] | undefined> | undefined;
    wrap?: MaybeRead<HTMLTextAreaElement['wrap'] | undefined> | undefined;
  }
  /** Props for h.time (HTMLTimeElement). */
  export interface HTMLTimeElementProps extends GlobalProps<HTMLTimeElement> {
    dateTime?: MaybeRead<HTMLTimeElement['dateTime'] | undefined> | undefined;
  }
  /** Props for h.tr (HTMLTableRowElement). */
  export interface HTMLTableRowElementProps extends GlobalProps<HTMLTableRowElement> {}
  /** Props for h.track (HTMLTrackElement). */
  export interface HTMLTrackElementProps extends GlobalProps<HTMLTrackElement> {
    default?: MaybeRead<HTMLTrackElement['default'] | undefined> | undefined;
    kind?: MaybeRead<HTMLTrackElement['kind'] | undefined> | undefined;
    label?: MaybeRead<HTMLTrackElement['label'] | undefined> | undefined;
    src?: MaybeRead<HTMLTrackElement['src'] | undefined> | undefined;
    srclang?: MaybeRead<HTMLTrackElement['srclang'] | undefined> | undefined;
  }
  /** Props for h.ul (HTMLUListElement). */
  export interface HTMLUListElementProps extends GlobalProps<HTMLUListElement> {}
  /** Props for h.video (HTMLVideoElement). */
  export interface HTMLVideoElementProps extends GlobalProps<HTMLVideoElement> {
    disablePictureInPicture?: MaybeRead<HTMLVideoElement['disablePictureInPicture'] | undefined> | undefined;
    height?: MaybeRead<HTMLVideoElement['height'] | undefined> | undefined;
    playsInline?: MaybeRead<HTMLVideoElement['playsInline'] | undefined> | undefined;
    poster?: MaybeRead<HTMLVideoElement['poster'] | undefined> | undefined;
    width?: MaybeRead<HTMLVideoElement['width'] | undefined> | undefined;
    autoplay?: MaybeRead<HTMLVideoElement['autoplay'] | undefined> | undefined;
    controls?: MaybeRead<HTMLVideoElement['controls'] | undefined> | undefined;
    crossOrigin?: MaybeRead<HTMLVideoElement['crossOrigin'] | undefined> | undefined;
    currentTime?: MaybeRead<HTMLVideoElement['currentTime'] | undefined> | undefined;
    defaultMuted?: MaybeRead<HTMLVideoElement['defaultMuted'] | undefined> | undefined;
    defaultPlaybackRate?: MaybeRead<HTMLVideoElement['defaultPlaybackRate'] | undefined> | undefined;
    disableRemotePlayback?: MaybeRead<HTMLVideoElement['disableRemotePlayback'] | undefined> | undefined;
    loop?: MaybeRead<HTMLVideoElement['loop'] | undefined> | undefined;
    muted?: MaybeRead<HTMLVideoElement['muted'] | undefined> | undefined;
    playbackRate?: MaybeRead<HTMLVideoElement['playbackRate'] | undefined> | undefined;
    preload?: MaybeRead<HTMLVideoElement['preload'] | undefined> | undefined;
    preservesPitch?: MaybeRead<HTMLVideoElement['preservesPitch'] | undefined> | undefined;
    src?: MaybeRead<HTMLVideoElement['src'] | undefined> | undefined;
    srcObject?: MaybeRead<HTMLVideoElement['srcObject'] | undefined> | undefined;
    volume?: MaybeRead<HTMLVideoElement['volume'] | undefined> | undefined;
    onencrypted?: Handler<HTMLMediaElementEventMap['encrypted'], HTMLVideoElement> | undefined;
    onwaitingforkey?: Handler<HTMLMediaElementEventMap['waitingforkey'], HTMLVideoElement> | undefined;
    onenterpictureinpicture?: Handler<HTMLVideoElementEventMap['enterpictureinpicture'], HTMLVideoElement> | undefined;
    onleavepictureinpicture?: Handler<HTMLVideoElementEventMap['leavepictureinpicture'], HTMLVideoElement> | undefined;
  }
  /** The tag functions behind h: h.div(props | null, ...children) creates and returns the real element; void elements (input, img, br, ...) and textarea take no children. */
  export interface H {
    a: (props: HTMLAnchorElementProps | null, ...children: Child[]) => HTMLAnchorElement;
    abbr: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    address: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    area: (props: HTMLAreaElementProps | null) => HTMLAreaElement;
    article: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    aside: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    audio: (props: HTMLAudioElementProps | null, ...children: Child[]) => HTMLAudioElement;
    b: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    bdi: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    bdo: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    blockquote: (props: HTMLQuoteElementProps | null, ...children: Child[]) => HTMLQuoteElement;
    br: (props: HTMLBRElementProps | null) => HTMLBRElement;
    button: (props: HTMLButtonElementProps | null, ...children: Child[]) => HTMLButtonElement;
    canvas: (props: HTMLCanvasElementProps | null, ...children: Child[]) => HTMLCanvasElement;
    caption: (props: HTMLTableCaptionElementProps | null, ...children: Child[]) => HTMLTableCaptionElement;
    cite: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    code: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    col: (props: HTMLTableColElementProps | null) => HTMLTableColElement;
    colgroup: (props: HTMLTableColElementProps | null, ...children: Child[]) => HTMLTableColElement;
    data: (props: HTMLDataElementProps | null, ...children: Child[]) => HTMLDataElement;
    datalist: (props: HTMLDataListElementProps | null, ...children: Child[]) => HTMLDataListElement;
    dd: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    del: (props: HTMLModElementProps | null, ...children: Child[]) => HTMLModElement;
    details: (props: HTMLDetailsElementProps | null, ...children: Child[]) => HTMLDetailsElement;
    dfn: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    dialog: (props: HTMLDialogElementProps | null, ...children: Child[]) => HTMLDialogElement;
    div: (props: HTMLDivElementProps | null, ...children: Child[]) => HTMLDivElement;
    dl: (props: HTMLDListElementProps | null, ...children: Child[]) => HTMLDListElement;
    dt: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    em: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    fieldset: (props: HTMLFieldSetElementProps | null, ...children: Child[]) => HTMLFieldSetElement;
    figcaption: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    figure: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    footer: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    form: (props: HTMLFormElementProps | null, ...children: Child[]) => HTMLFormElement;
    h1: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    h2: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    h3: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    h4: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    h5: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    h6: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    header: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    hgroup: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    hr: (props: HTMLHRElementProps | null) => HTMLHRElement;
    i: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    iframe: (props: HTMLIFrameElementProps | null, ...children: Child[]) => HTMLIFrameElement;
    img: (props: HTMLImageElementProps | null) => HTMLImageElement;
    input: (props: HTMLInputElementProps | null) => HTMLInputElement;
    ins: (props: HTMLModElementProps | null, ...children: Child[]) => HTMLModElement;
    kbd: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    label: (props: HTMLLabelElementProps | null, ...children: Child[]) => HTMLLabelElement;
    legend: (props: HTMLLegendElementProps | null, ...children: Child[]) => HTMLLegendElement;
    li: (props: HTMLLIElementProps | null, ...children: Child[]) => HTMLLIElement;
    main: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    map: (props: HTMLMapElementProps | null, ...children: Child[]) => HTMLMapElement;
    mark: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    menu: (props: HTMLMenuElementProps | null, ...children: Child[]) => HTMLMenuElement;
    meter: (props: HTMLMeterElementProps | null, ...children: Child[]) => HTMLMeterElement;
    nav: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    ol: (props: HTMLOListElementProps | null, ...children: Child[]) => HTMLOListElement;
    optgroup: (props: HTMLOptGroupElementProps | null, ...children: Child[]) => HTMLOptGroupElement;
    option: (props: HTMLOptionElementProps | null, ...children: Child[]) => HTMLOptionElement;
    output: (props: HTMLOutputElementProps | null, ...children: Child[]) => HTMLOutputElement;
    p: (props: HTMLParagraphElementProps | null, ...children: Child[]) => HTMLParagraphElement;
    picture: (props: HTMLPictureElementProps | null, ...children: Child[]) => HTMLPictureElement;
    pre: (props: HTMLPreElementProps | null, ...children: Child[]) => HTMLPreElement;
    progress: (props: HTMLProgressElementProps | null, ...children: Child[]) => HTMLProgressElement;
    q: (props: HTMLQuoteElementProps | null, ...children: Child[]) => HTMLQuoteElement;
    rp: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    rt: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    ruby: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    s: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    samp: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    search: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    section: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    select: (props: HTMLSelectElementProps | null, ...children: Child[]) => HTMLSelectElement;
    small: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    source: (props: HTMLSourceElementProps | null) => HTMLSourceElement;
    span: (props: HTMLSpanElementProps | null, ...children: Child[]) => HTMLSpanElement;
    strong: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    sub: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    summary: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    sup: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    table: (props: HTMLTableElementProps | null, ...children: Child[]) => HTMLTableElement;
    tbody: (props: HTMLTableSectionElementProps | null, ...children: Child[]) => HTMLTableSectionElement;
    td: (props: HTMLTableCellElementProps | null, ...children: Child[]) => HTMLTableCellElement;
    textarea: (props: HTMLTextAreaElementProps | null) => HTMLTextAreaElement;
    tfoot: (props: HTMLTableSectionElementProps | null, ...children: Child[]) => HTMLTableSectionElement;
    th: (props: HTMLTableCellElementProps | null, ...children: Child[]) => HTMLTableCellElement;
    thead: (props: HTMLTableSectionElementProps | null, ...children: Child[]) => HTMLTableSectionElement;
    time: (props: HTMLTimeElementProps | null, ...children: Child[]) => HTMLTimeElement;
    tr: (props: HTMLTableRowElementProps | null, ...children: Child[]) => HTMLTableRowElement;
    track: (props: HTMLTrackElementProps | null) => HTMLTrackElement;
    u: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    ul: (props: HTMLUListElementProps | null, ...children: Child[]) => HTMLUListElement;
    var: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    video: (props: HTMLVideoElementProps | null, ...children: Child[]) => HTMLVideoElement;
    wbr: (props: HTMLElementProps | null) => HTMLElement;
  }
  // </generated:elements>

  export {};
}

declare module 'jasno/router' {
  import type { Child, Read, Signal } from 'jasno';
  type Rendered = Exclude<Child, null | undefined | boolean>;
  type RegexChar = '\\' | '[' | ']' | '.' | '*' | '+' | '?' | '^' | '$' | '{' | '}' | '(' | ')';
  type Alternatives<S extends string> = S extends `${infer A}|${infer B}` ? A | Alternatives<B> : S;
  // ':tab(profile|billing)' gives 'profile' | 'billing'; any other constraint gives string.
  type Constraint<S extends string> = S extends `${string}${RegexChar}${string}` ? string : Alternatives<S>;
  type Segment<S extends string> =
    S extends `:${infer N}(${infer C})` ? { [K in N]: Constraint<C> } :
    S extends `:${infer N}?` ? { [K in N]?: string } :
    S extends `:${infer N}+` ? { [K in N]: string } :
    S extends `:${infer N}*` ? { [K in N]?: string } :
    S extends `:${infer N}` ? { [K in N]: string } : {};
  type Split<S extends string> = S extends `${infer H}/${infer T}` ? Segment<H> & Split<T> : Segment<S>;
  type HrefParams<P extends string> = { [K in keyof Params<P>]: Params<P>[K] extends string ? (string extends Params<P>[K] ? string | number : Params<P>[K]) : Params<P>[K] };
  type HrefArgs<P extends string> =
    keyof Params<P> extends never ? [] : {} extends Params<P> ? [params?: HrefParams<P>] : [params: HrefParams<P>];

  /** Path params of a pattern: '/users/:id' gives { id: string }; ':x?' and ':x*' are optional, ':x+' is required, ':tab(a|b)' gives 'a' | 'b'. Values are decoded strings. */
  export type Params<P extends string> = { [K in keyof Split<P>]: Split<P>[K] } & {};
  /** What a route loader receives: decoded params and an abortSignal aborted when the navigation is superseded. */
  export interface LoaderContext<P extends string> {
    readonly params: Params<P>;
    readonly abortSignal: AbortSignal;
  }
  /** Props of a route view: live params and loader data. The view stays mounted while the same route matches: read them inside functions, and put per-param work in match(() => p.params().id, (id) => Body({ id })). */
  export interface ViewProps<P extends string, D = undefined> {
    readonly params: Read<Params<P>>;
    readonly data: Read<D>;
  }
  type LoaderOption<P extends string, D> = [D] extends [undefined]
    ? { readonly loader?: ((ctx: LoaderContext<P>) => Promise<unknown>) | undefined }
    : { readonly loader: (ctx: LoaderContext<P>) => Promise<NoInfer<D>> };
  /** Route definition: lazy view module (default export; a component without props works too), eager loader, optional title (a live binding; without it the router restores index.html's title and the view may set its own). The view's ViewProps<P, D> decides D: if D is not undefined, loader is required and must resolve to D. */
  export type RouteOptions<P extends string, D> = {
    readonly view: () => Promise<{ readonly default: (props: ViewProps<P, D>) => Node }>;
    readonly title?: string | ((data: NoInfer<D>) => string) | undefined;
  } & LoaderOption<P, D>;
  /** A route created by route(); only its pattern is visible to types. */
  export interface Route<P extends string = string> {
    readonly path: P;
  }
  /** Declares a route. Pattern: '/'-rooted static segments, :name, :name?, :name+, :name*, :name(a|b); list specific routes before param routes (a shadowed route throws ROUTE_SHADOWED). */
  export function route<const P extends `/${string}`, D = undefined>(path: P, options: RouteOptions<NoInfer<P>, D>): Route<P>;
  /** createRouter options: error renders in the outlet when a loader, view import, view setup or view effect fails (retry() re-runs the navigation); notFound renders for a URL no route matches. Both return something visible. */
  export interface RouterOptions {
    readonly error: (error: unknown, retry: () => void) => Rendered;
    readonly notFound: () => Rendered;
  }
  /** A URL you can read but not change in place (change the URL with navigate()). */
  export type ReadonlyURL = Readonly<Omit<URL, 'searchParams'>> & {
    readonly searchParams: Pick<URLSearchParams, 'get' | 'getAll' | 'has' | 'forEach' | 'entries' | 'keys' | 'values' | 'toString' | 'size'>;
  };
  /** How a navigation ended: 'done' (a view or notFound rendered), 'superseded' (a newer navigation took over), 'failed' (the error view rendered). */
  export type NavigateResult = 'done' | 'superseded' | 'failed';
  /** The app's router: outlet() renders the matched view, href() builds typed URLs for plain h.a links, navigate() resolves after render and focus. Members are bound. */
  export interface Router<Path extends string> {
    /** Renders the current route's view; call exactly once, inside App (h.main(null, router.outlet())). Starts the router. */
    outlet(): Node;
    /** Builds a URL from a pattern of this router's table; params are required exactly when the pattern has required params (numbers are fine). */
    href<const P extends string>(path: P extends Path ? P : Path, ...params: HrefArgs<P>): string;
    /** Navigates (relative URLs such as '?q=x' resolve against the current one); resolves after the new view rendered, title set and focus moved. Never rejects for navigation outcomes, so void router.navigate(url) is fine. */
    readonly navigate: (url: string, options?: { readonly replace?: boolean | undefined }) => Promise<NavigateResult>;
    /** Closes a detail the user opened in the app: goes back one history entry when it is this app's, else navigate(fallback, { replace: true }) (a deep link). Resolves like navigate(). Use it instead of history.back(). */
    readonly back: (fallback: string) => Promise<NavigateResult>;
    /** URL of the rendered view; a search- or hash-only navigate() updates it before returning, without reloading data or moving focus. */
    readonly url: Signal<ReadonlyURL>;
    /** True while a navigation is loading data or a view module. */
    readonly isLoading: Signal<boolean>;
  }
  /** Creates the router from the route table (one per app, exported from src/routes.ts). Only same-origin links whose path matches a route are intercepted; others load normally. */
  export function createRouter<const R extends readonly Route[]>(routes: R, options: RouterOptions): Router<R[number]['path']>;
  export {};
}

declare module 'jasno/testing' {
  import type { Diagnostic, DiagnosticCode } from 'jasno';
  /** Codes that always mean the component code is wrong: fix them, never expect them. */
  type FixNotExpect =
    | 'STRICT_READ_UNTRACKED' | 'LOADER_READ_UNTRACKED' | 'UNTRACKED_IN_DERIVATION' | 'PENDING_READ_UNTRACKED'
    | 'SIGNAL_COERCED' | 'NODE_IN_TEXT_BINDING' | 'EFFECT_WRITES_STATE' | 'EFFECT_NO_DEPS' | 'WRITE_IN_SETUP'
    | 'LEAK_IN_SETUP' | 'NO_OWNER' | 'UNSTABLE_KEY' | 'NODE_OUTSIDE_REGION' | 'COMPONENT_RETURN_NOT_NODE' | 'KEY_ACTIVATES_NEW_FOCUS'
    | 'EFFECT_LEAKED' | 'EXPECTED_DIAGNOSTIC_MISSING' | 'SETTLE_TIMEOUT' | 'UNCAUGHT_ERROR' | 'TESTING_REQUIRES_DEV_BUILD';
  /** The part of node:test's TestContext that mountTest uses: pass the t of test('name', (t) => ...). */
  export interface TestContextLike {
    after(fn: () => void): void;
  }
  /** mountTest options: expect lists codes a test about warnings requires to occur (each must occur); codes that mean broken code cannot be listed. */
  export interface MountTestOptions {
    readonly expect?: readonly Exclude<DiagnosticCode, FixNotExpect>[] | undefined;
  }
  /** A mounted view: root is a container attached to document.body; diagnostics are the events recorded for this view. */
  export interface MountedTest {
    readonly root: HTMLElement;
    readonly diagnostics: readonly Diagnostic[];
    /** Unmounts now (also done automatically after the test); throws on unexpected diagnostics, uncaught reactive errors, missing expected codes, or effects still alive (EFFECT_LEAKED). */
    dispose(): void;
  }
  /** Renders view() into a fresh container, flushes once and registers the post-test checks on t. Warnings and uncaught effect errors fail the test; signals created outside components are reset to their initial values afterwards (module-level createRoot roots are app-lifetime: neither reset nor reported as leaked). */
  export function mountTest(t: TestContextLike, view: () => Node, options?: MountTestOptions): MountedTest;
  /** Resolves when nothing is pending (flush queue, loaders, navigations), using real timers even under mock.timers; rejects with unexpected diagnostics or SETTLE_TIMEOUT naming what is pending (default 2000 ms). */
  export function settled(options?: { readonly timeout?: number | undefined }): Promise<void>;
  export {};
}

/** Side-effect module for tests: registers happy-dom globals (node --conditions=development --import jasno/testing/happy-dom --test --test-isolation=none "src/**\/*.test.ts"). */
declare module 'jasno/testing/happy-dom' {}

interface Window {
  /** jasno dev-build introspection (undefined in production): diagnostics(), graph(), inspect(), why(), router(). */
  readonly __JASNO__?: import('jasno').FFDevtools;
}
