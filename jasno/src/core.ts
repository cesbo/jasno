// Reactive core: alien-signals' graph (vendored) plus the surface layer that fixes it (design.md ADR-11, B1-B8,
// B13, B21): Object.is equality, cached computed errors, writes by context, owners and disposal, the microtask
// flush with phases (a) bindings and (b) effects, the loop cap, error routing.
import { DEV } from '#dev';
import { createReactiveSystem, type Link, type ReactiveNode } from './vendor/system.js';
import { JasnoError, userFrame, warn } from './diag.ts';

const Mutable = 1, Watching = 2, RecursedCheck = 4, Dirty = 16, Pending = 32;
const CAP = 100;

export type Kind = 'signal' | 'computed' | 'linkedSignal' | 'effect' | 'binding' | 'resource' | 'selector';
export type Cleanup = () => void;
type Equal = (a: any, b: any) => boolean;

let ids = 0;
let seqs = 0;
let cycle = 0;

// ---------------------------------------------------------------- execution context

/** Consumer recording reads. */
let S_sub: ReactiveNode | undefined;
/** Current owner. */
let S_owner: Owner | undefined;
/** Running derivation (not cleared by untracked(): writes still throw, B5.1). */
let S_deriv: RNode | undefined;
/** Effect whose synchronous run this is (B5.3). */
let S_effect: EffectNode | undefined;
/** Setup region id (both builds: FLUSH_REENTRANT, WRITE_IN_SETUP). 0 outside setup. */
let S_setup = 0;
/** Setup region label (dev): kept inside untracked(), for WRITE_IN_SETUP messages. */
let S_region: string | undefined;
/** Strict-read label of the setup region (dev, B12): cleared inside untracked(). */
let S_label: string | undefined;
/** Resource whose loader jasno is calling (dev, B12.3). */
let S_loader: string | undefined;
let setupIds = 0;

// The last three slots are dev-only: production never sets them, so it saves five.
type Ctx = [ReactiveNode | undefined, Owner | undefined, RNode | undefined, EffectNode | undefined, number, (string | undefined)?, (string | undefined)?, (string | undefined)?];
const save = (): Ctx => DEV
  ? [S_sub, S_owner, S_deriv, S_effect, S_setup, S_region, S_label, S_loader]
  : [S_sub, S_owner, S_deriv, S_effect, S_setup];
const restore = (c: Ctx): void => {
  S_sub = c[0]; S_owner = c[1]; S_deriv = c[2]; S_effect = c[3]; S_setup = c[4];
  if (DEV) { S_region = c[5]; S_label = c[6]; S_loader = c[7]; }
};
function enter(sub: ReactiveNode | undefined, owner: Owner | undefined, deriv: RNode | undefined, eff: EffectNode | undefined): Ctx {
  const c = save();
  S_sub = sub; S_owner = owner; S_deriv = deriv; S_effect = eff; S_setup = 0;
  if (DEV) { S_region = undefined; S_label = undefined; S_loader = undefined; }
  return c;
}

export const currentOwner = (): Owner | undefined => S_owner;

/** Runs fn as setup of owner o (component body, builder, mount view): untracked, strict label set (B12.1, B14.1). */
export function runSetup<T>(o: Owner, label: string, fn: () => T): T {
  const c = enter(undefined, o, undefined, undefined);
  S_setup = ++setupIds;
  if (DEV) S_region = S_label = label;
  try { return fn(); } finally { restore(c); }
}

/** Runs fn with o as the current owner; setup and labels unchanged, tracking off (createRoot, provide). */
export function runOwned<T>(o: Owner, fn: () => T): T {
  const sub = S_sub, owner = S_owner;
  S_sub = undefined; S_owner = o;
  try { return fn(); } finally { S_sub = sub; S_owner = owner; }
}

/** Handlers, cleanups, jasno internals: untracked, no owner, no label (B6.10, B15.7). */
export function runBare<T>(fn: () => T): T {
  const c = enter(undefined, undefined, undefined, undefined);
  try { return fn(); } finally { restore(c); }
}

/** Runs fn as a derivation of node (an each key function): untracked, no owner, writes throw (Terms, B5.1). */
export function runDerived<T>(node: RNode, fn: () => T): T {
  const c = enter(undefined, undefined, node, undefined);
  try { return fn(); } finally { restore(c); }
}

/** Calls a resource loader: untracked, outside setup, with the loader label (B9.5, B12.3). */
let loaderOwner: Owner | undefined;
export function runLoader<T>(name: string, owner: Owner | undefined, fn: () => T): T {
  const c = enter(undefined, undefined, undefined, undefined);
  const lo = loaderOwner;
  if (DEV) { S_loader = name; loaderOwner = owner; }
  try { return fn(); } finally { restore(c); loaderOwner = lo; }
}

export function untracked<T>(fn: () => T): T {
  const sub = S_sub, label = S_label, loader = S_loader;
  if (DEV && S_deriv) S_deriv.usedUntracked = true;
  S_sub = undefined; S_label = undefined; S_loader = undefined;
  try { return fn(); } finally { S_sub = sub; S_label = label; S_loader = loader; }
}

// ---------------------------------------------------------------- nodes

export interface RNode extends ReactiveNode {
  kind: Kind;
  id: number;
  name: string | undefined;
  dead?: boolean;
  usedUntracked?: boolean;
  /** dev: the write that last scheduled this consumer (B4.9). */
  cause?: WriteCause | undefined;
}

export class SignalNode implements RNode {
  deps = undefined; depsTail = undefined;
  subs: Link | undefined = undefined; subsTail: Link | undefined = undefined;
  flags = Mutable;
  kind: Kind = 'signal';
  id = ++ids;
  name: string | undefined;
  value: any;
  equal: Equal;
  /** dev token (B6.2): the setup that created it, for WRITE_IN_SETUP. */
  setupId = 0;
  owner: Owner | undefined;
  /** Selector key nodes point back to their selector. */
  selector: SelectorNode | undefined;
  key: unknown;
  constructor(value: unknown, equal: Equal, name: string | undefined) {
    this.value = value; this.equal = equal; this.name = name;
  }
}

export class ComputedNode implements RNode {
  deps: Link | undefined = undefined; depsTail: Link | undefined = undefined;
  subs: Link | undefined = undefined; subsTail: Link | undefined = undefined;
  flags = Mutable | Dirty;
  kind: Kind;
  id = ++ids;
  name: string | undefined;
  value: any = undefined;
  has = false;
  error = false;
  getter: () => unknown;
  equal: Equal;
  dead = false;
  usedUntracked = false;
  total = 0;
  owner: Owner | undefined;
  /** linkedSignal: dev token of the creating setup (WRITE_IN_SETUP). */
  setupId = 0;
  constructor(kind: Kind, getter: () => unknown, equal: Equal, name: string | undefined) {
    this.kind = kind; this.getter = getter; this.equal = equal; this.name = name;
    this.owner = S_owner;
    S_owner?.adopt(this);
    if (DEV) registerNode(this);
  }
}

export interface BindingOptions {
  /** Skip apply when the value is Object.is-equal to the last applied one (B15.3). Default true. */
  readonly skip?: boolean | undefined;
  readonly name?: string | undefined;
}

export class Binding implements RNode {
  deps: Link | undefined = undefined; depsTail: Link | undefined = undefined;
  subs = undefined; subsTail = undefined;
  flags = 0;
  kind: Kind = 'binding';
  id = ++ids;
  seq = ++seqs;
  name: string | undefined;
  fn: () => unknown;
  apply: (v: any) => void;
  value: unknown = undefined;
  skip: boolean;
  owner: Owner | undefined;
  dead = false;
  usedUntracked = false;
  epoch = 0; runs = 0; /** runs over its lifetime (__JASNO__ graph/inspect) */ total = 0;
  cause: WriteCause | undefined;
  constructor(fn: () => unknown, apply: (v: any) => void, o: BindingOptions | undefined) {
    this.fn = fn; this.apply = apply; this.skip = o?.skip ?? true; this.name = o?.name;
    this.owner = S_owner;
    S_owner?.adopt(this);
    if (DEV) registerNode(this);
  }
}

// ---------------------------------------------------------------- owners

export class Owner {
  parent: Owner | undefined;
  children: Set<Owner> | undefined;
  nodes: RNode[] | undefined;
  cleanups: Cleanup[] | undefined;
  ctx: Map<unknown, unknown> | undefined;
  ac: AbortController | undefined;
  /** 0 alive, 1 disposing, 2 disposed. */
  state = 0;
  /** Owner path segment: "<Name>", "show", "each row" ... */
  name: string | undefined;
  /** Region prefix for builder labels: the component name ("<App>"), "<mount>". */
  comp: string | undefined;
  boundary: ((error: unknown) => void) | undefined;
  /** createRoot with no current owner: app-lifetime (B6.7). */
  appRoot = false;
  constructor(parent: Owner | undefined, name?: string) {
    this.parent = parent;
    this.name = name;
    // An owner created under a disposed one is born disposed: nothing in it ever runs (B6.3 step 1, B6.5).
    if (parent?.state) this.state = 2;
    else if (parent) (parent.children ??= new Set()).add(this);
    hooks.ownerCreated?.(this);
  }
  adopt(n: RNode): void {
    if (this.state) n.dead = true;
    else (this.nodes ??= []).push(n);
  }
  onCleanup(fn: Cleanup): void {
    if (this.state) runBare(fn);
    else (this.cleanups ??= []).push(fn);
  }
}

export function ownerPath(o: Owner | undefined): string {
  const parts: string[] = [];
  for (let x = o; x; x = x.parent) if (x.name && !(x instanceof EffectNode)) parts.push(x.name);
  return parts.reverse().join(' › ');
}

export function regionLabel(parent: Owner | undefined, kind: string): string {
  let x = parent;
  while (x && !x.comp) x = x.parent;
  return `${x?.comp ?? '<root>'} › ${kind}`;
}

export function isInside(o: Owner | undefined, ancestor: Owner): boolean {
  for (let x = o; x; x = x.parent) if (x === ancestor) return true;
  return false;
}

export const abortReason = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');

export function signalOf(o: Owner): AbortSignal {
  if (o.state) return AbortSignal.abort(abortReason());
  return (o.ac ??= new AbortController()).signal;
}

function markDeep(o: Owner): void {
  o.state = 1;
  if (o.children) for (const c of o.children) if (c.state === 0) markDeep(c);
}

function disposeChildren(o: Owner): void {
  const cs = o.children;
  if (!cs) return;
  o.children = undefined;
  const list = [...cs];
  for (let i = list.length; i--;) destroy(list[i]!);
}

function abortOwner(o: Owner): void {
  const ac = o.ac;
  if (!ac) return;
  o.ac = undefined;
  runBare(() => ac.abort(abortReason()));
}

function runCleanups(o: Owner): void {
  const cs = o.cleanups;
  if (!cs) return;
  o.cleanups = undefined;
  for (let i = cs.length; i--;) {
    try { runBare(cs[i]!); } catch (e) { handleError(e, o); }
  }
}

function unlinkNodes(o: Owner): void {
  const ns = o.nodes;
  if (!ns) return;
  o.nodes = undefined;
  for (const n of ns) { n.dead = true; dropDeps(n); n.flags = 0; }
}

/** Steps 2-5 of B6.3. */
function teardown(o: Owner): void {
  disposeChildren(o);
  abortOwner(o);
  runCleanups(o);
  unlinkNodes(o);
  if (o instanceof EffectNode) { dropDeps(o); o.flags = 0; }
  o.state = 2;
  o.ctx = undefined;
  o.boundary = undefined;
}

function destroy(o: Owner): void {
  if (o.state === 2) return;
  if (o.state === 0) markDeep(o);
  if (o instanceof EffectNode && o.running) {
    // Self-disposal (B6.5): the run's owner goes now (abort included); the rest when the run returns.
    disposeChildren(o);
    return;
  }
  teardown(o);
}

/** Disposes an owner (B6.3). Idempotent. */
export function dispose(o: Owner): void {
  if (o.state !== 0) return;
  destroy(o);
  o.parent?.children?.delete(o);
}

// ---------------------------------------------------------------- errors

export const hooks: {
  reporter: ((error: unknown, owner: Owner | undefined) => void) | undefined;
  ownerCreated: ((o: Owner) => void) | undefined;
  pending: ((p: Promise<unknown>, what: string) => void) | undefined;
  handlerPromise: ((p: Promise<unknown>, what: string) => void) | undefined;
  flushStart: (() => void) | undefined;
  flushEnd: (() => void) | undefined;
  /** @jasno/core/router registers its state for __JASNO__.router(). */
  routerInfo: (() => unknown) | undefined;
  /** A router navigation that will move focus: the focus-loss check waits for it (B20.2). */
  focusPending: (() => Promise<unknown> | undefined) | undefined;
} = { reporter: undefined, ownerCreated: undefined, pending: undefined, handlerPromise: undefined, flushStart: undefined, flushEnd: undefined, routerInfo: undefined, focusPending: undefined };

/** Boundary marker of a try region that its catchError is replacing: errors from inside are dropped (B8.5). */
export const DROP = (): void => {};

/** B8.3: nearest live catchError region up the owner tree, else report(). */
export function handleError(error: unknown, o: Owner | undefined): void {
  for (let x = o; x; x = x.parent) {
    if (x.boundary === DROP) return;
    if (x.boundary && x.state === 0) {
      try { x.boundary(error); } catch (e) { handleError(e, x.parent); }
      return;
    }
  }
  report(error, o);
}

export function report(error: unknown, o?: Owner): void {
  if (hooks.reporter) return hooks.reporter(error, o);
  const g = globalThis as { reportError?: (e: unknown) => void };
  if (typeof g.reportError === 'function') g.reportError(error);
  else queueMicrotask(() => { throw error; });
}

/** Errors found outside a flush (a selector source) are routed at the start of the next flush. */
const deferred: [unknown, Owner | undefined][] = [];

// ---------------------------------------------------------------- graph

const { link, unlink, propagate, checkDirty, shallowPropagate } = createReactiveSystem({
  update(n) { return updateComputed(n as ComputedNode); },
  notify(n) {
    n.flags &= ~Watching;
    const r = n as RNode;
    if (DEV && currentWrite) { r.cause = currentWrite; flushCause ??= currentWrite; }
    if (r.kind === 'binding') heapPush(r as Binding);
    else if (r.kind === 'effect') queueB.push(r as EffectNode);
    else if (r.kind === 'selector') { pendingSelectors.push(r as SelectorNode); return; }
    schedule();
  },
  unwatched(n) {
    const r = n as RNode;
    if (r instanceof ComputedNode) {
      if (r.deps) { dropDeps(r); r.flags = Mutable | Dirty; }
    } else if (r instanceof SignalNode && r.selector) {
      r.selector.keys.delete(r.key);
    }
  },
});

function dropDeps(n: ReactiveNode): void {
  let l = n.depsTail;
  while (l) { const p = l.prevDep; unlink(l, n); l = p; }
}

function purgeDeps(n: ReactiveNode): void {
  let l = n.depsTail ? n.depsTail.nextDep : n.deps;
  while (l) l = unlink(l, n);
}

function eq(equal: Equal, a: unknown, b: unknown): boolean {
  if (equal === Object.is) return Object.is(a, b);
  const sub = S_sub;
  S_sub = undefined;
  try { return equal(a, b); } finally { S_sub = sub; }
}

// ---------------------------------------------------------------- signals

interface WriteCause { node: RNode; stack: Error }
let currentWrite: WriteCause | undefined;
/** dev: the first write that scheduled the pending flush; the running flush's cause (B20.2). */
let flushCause: WriteCause | undefined;
let runningCause: WriteCause | undefined;

export function describeCause(c: WriteCause | undefined): string | undefined {
  if (!c) return undefined;
  const at = userFrame(c.stack.stack);
  return `${nameOf(c.node)}.set${at ? ` at ${at}` : ''}`;
}
export const currentFlushCause = (): string | undefined => describeCause(runningCause);

function writeInDerivation(n: RNode): JasnoError {
  const d = S_deriv!;
  return new JasnoError('WRITE_IN_DERIVATION', `Write to signal "${nameOf(n)}" inside ${d.kind} "${nameOf(d)}".`,
    'Derivations must be pure: compute it with computed()/linkedSignal(), or move the write to an event handler.',
    { ownerPath: ownerPath(S_owner), node: nameOf(n) });
}

export function nameOf(n: RNode): string {
  return n.name ?? `${n.kind}#${n.id}`;
}

export function readSignal(n: SignalNode): unknown {
  if (DEV && (S_label || S_loader)) strictRead(n);
  if (S_sub) link(n, S_sub, cycle);
  return n.value;
}

export function writeSignal(n: SignalNode, v: unknown): void {
  if (S_deriv) throw writeInDerivation(n);
  if (eq(n.equal, n.value, v)) return;
  if (DEV) devWrite(n);
  n.value = v;
  propagateFrom(n);
}

/** jasno-internal write: no context checks, no diagnostics (row item/index, show value, resource record). */
export function writeRaw(n: SignalNode, v: unknown): void {
  if (Object.is(n.value, v)) return;
  n.value = v;
  propagateFrom(n);
}

function propagateFrom(n: RNode): void {
  const subs = n.subs;
  if (!subs) return;
  const prev = currentWrite;
  if (DEV) currentWrite = { node: n, stack: new Error() };
  try {
    propagate(subs, false);
    shallowPropagate(subs);
    drainSelectors();
  } finally { currentWrite = prev; }
}

function devWrite(n: SignalNode | ComputedNode): void {
  if (S_effect) {
    let read = false;
    for (let l = S_effect.deps; l; l = l.nextDep) if (l.dep === n) { read = true; break; }
    if (n.subs || read) {
      warn('EFFECT_WRITES_STATE', `Effect "${nameOf(S_effect)}" wrote signal "${nameOf(n)}" during its run.`,
        'Derive it with computed() or linkedSignal(), or write it in the event handler that caused the change; effects only sync the outside world. A subscription whose callback sets signals goes in onMount (a new route param builds a new view, so it restarts per param).',
        { ownerPath: ownerPath(S_effect.parent), node: nameOf(n), key: `${S_effect.id}:${n.id}`, owner: S_effect });
    }
  } else if (S_setup && n.setupId !== S_setup) {
    warn('WRITE_IN_SETUP', `Setup of ${S_region} wrote "${nameOf(n)}".`,
      'Rendering must not change other state: move the write to onMount() or a handler, or derive it.',
      { ownerPath: ownerPath(S_owner), node: nameOf(n), region: S_region, owner: S_owner });
  }
}

function strictRead(n: RNode): void {
  if (S_loader) {
    warn('LOADER_READ_UNTRACKED', `Signal "${nameOf(n)}" was read in the loader of resource "${S_loader}"; changing it will not reload.`,
      'Move the read into params: () => .... Use untracked() there only if a change must not reload.',
      { ownerPath: ownerPath(loaderOwner), node: nameOf(n), region: `${S_loader} loader`, owner: loaderOwner });
    return;
  }
  warn('STRICT_READ_UNTRACKED', `Signal "${nameOf(n)}" was read directly in ${S_label}; the value will not update.`,
    'Make it live: pass the signal or () => .... untracked() is only for values that must never update.',
    { ownerPath: ownerPath(S_owner), node: nameOf(n), region: S_label, owner: S_owner });
}

export const strictLabel = (): string | undefined => (DEV ? S_label : undefined);

const signalProto: object | undefined = DEV
  ? Object.create(Function.prototype, {
    [Symbol.toPrimitive]: {
      value(this: unknown) {
        const n = nodeOfFn.get(this as Function);
        throw new JasnoError('SIGNAL_COERCED', `Signal "${n ? nameOf(n) : '?'}" was used as a value.`,
          'Call it: `${count()}`, count() + 1.', { node: n && nameOf(n) }, TypeError);
      },
    },
  })
  : undefined;
const nodeOfFn = new WeakMap<Function, RNode>();

/** Brands a reader function in dev: coercion throws SIGNAL_COERCED (ADR-05 trap), __JASNO__ can name it. */
export function brand<F extends Function>(fn: F, n: RNode): F {
  if (DEV) { Object.setPrototypeOf(fn, signalProto!); nodeOfFn.set(fn, n); }
  return fn;
}
export const nodeOf = (fn: Function): RNode | undefined => nodeOfFn.get(fn);

/** Signals created outside any owner (dev): @jasno/core/testing resets them after each test (B19.5). */
const outsideSignals: { ref: WeakRef<RNode>; reset: (n: any) => void }[] = [];

export function resetOutsideSignals(): void {
  for (let i = outsideSignals.length; i--;) {
    const e = outsideSignals[i]!;
    const n = e.ref.deref();
    if (!n) { outsideSignals.splice(i, 1); continue; }
    e.reset(n);
  }
}

export function signal(initial: unknown, options?: { equal?: Equal | undefined; debugName?: string | undefined }): any {
  const n = new SignalNode(initial, options?.equal ?? Object.is, options?.debugName);
  if (DEV) {
    n.setupId = S_setup;
    n.owner = S_owner;
    registerNode(n);
    if (!S_owner) outsideSignals.push({ ref: new WeakRef(n), reset: (x: SignalNode) => writeRaw(x, initial) });
  }
  const read = () => readSignal(n);
  read.set = (v: unknown) => writeSignal(n, v);
  read.update = (fn: (v: unknown) => unknown) => writeSignal(n, fn(n.value));
  return brand(read, n);
}

/** Internal signal (row item/index, show value, resource record): written with writeRaw. */
export function rawSignal(initial: unknown, name?: string): SignalNode {
  const n = new SignalNode(initial, Object.is, name);
  if (DEV) registerNode(n);
  return n;
}

export function readerOf(n: SignalNode): () => any {
  return brand(() => readSignal(n), n);
}

// ---------------------------------------------------------------- computed, linkedSignal

function updateComputed(c: ComputedNode): boolean {
  c.depsTail = undefined;
  c.flags = Mutable | RecursedCheck;
  c.usedUntracked = false;
  const ctx = enter(c, undefined, c, undefined);
  ++cycle;
  if (DEV) c.total++;
  let changed: boolean;
  try {
    const v = c.getter();
    changed = !c.has || c.error || !eq(c.equal, c.value, v);
    if (changed) { c.value = v; c.error = false; c.has = true; }
  } catch (e) {
    changed = !(c.error && c.value === e);
    c.value = e; c.error = true; c.has = true;
  } finally {
    restore(ctx);
    c.flags &= ~RecursedCheck;
    purgeDeps(c);
  }
  if (DEV && c.usedUntracked && !c.deps) untrackedInDerivation(c, c.owner);
  return changed;
}

function untrackedInDerivation(n: RNode, owner: Owner | undefined): void {
  warn('UNTRACKED_IN_DERIVATION', `${n.kind} "${nameOf(n)}" read nothing tracked; it can never update.`,
    'Read the signal directly; untracked() is for setup-time seeds only.', { ownerPath: ownerPath(owner), node: nameOf(n), owner });
}

/** Brings an observed computed up to date (checkDirty when pending). */
function refresh(c: ComputedNode): void {
  const f = c.flags;
  if (f & Dirty || (f & Pending && c.deps && (checkDirty(c.deps, c) || (c.flags = f & ~Pending, false)))) {
    if (updateComputed(c) && c.subs) shallowPropagate(c.subs);
  } else if (f & Pending) {
    c.flags = f & ~Pending;
  }
}

export function readComputed(c: ComputedNode, track = true): unknown {
  if (DEV && track && (S_label || S_loader)) strictRead(c);
  if (c.dead) {
    // Disposed (B6.3 step 5): evaluate untracked, cache and link nothing.
    const ctx = enter(undefined, undefined, c, undefined);
    try { return c.getter(); } finally { restore(ctx); }
  }
  const sub = track ? S_sub : undefined;
  if (!sub && !c.subs) {
    // Unobserved (B1.3, m1): recompute and keep no links.
    updateComputed(c);
    dropDeps(c);
    c.flags = Mutable | Dirty;
  } else {
    refresh(c);
    if (sub) link(c, sub, cycle);
  }
  if (c.error) throw c.value;
  return c.value;
}

export function computedNode(fn: () => unknown, options?: { equal?: Equal | undefined; debugName?: string | undefined }, kind: Kind = 'computed'): ComputedNode {
  return new ComputedNode(kind, fn, options?.equal ?? Object.is, options?.debugName);
}

export function computed(fn: () => unknown, options?: { equal?: Equal | undefined; debugName?: string | undefined }): any {
  const c = computedNode(fn, options);
  return brand(() => readComputed(c), c);
}

export function linkedSignal(options: {
  source: () => unknown;
  computation: (source: unknown, previous: { source: unknown; value: unknown } | undefined) => unknown;
  equal?: Equal | undefined;
  debugName?: string | undefined;
}): any {
  const { source, computation } = options;
  let init = false;
  let last: unknown;
  const c = computedNode(() => {
    const s = source();
    if (init && Object.is(s, last)) return c.value;
    const prev = init ? { source: last, value: c.value } : undefined;
    let v: unknown;
    try {
      const sub = S_sub;
      S_sub = undefined; // computation runs untracked, still a derivation (B5.6)
      try { v = computation(s, prev); } finally { S_sub = sub; }
    } catch (e) { init = false; throw e; }
    init = true;
    last = s;
    return v;
  }, options, 'linkedSignal');
  c.setupId = S_setup;
  if (DEV && !S_owner) {
    outsideSignals.push({ ref: new WeakRef(c), reset: () => { init = false; c.has = false; c.error = false; c.flags |= Dirty; propagateFrom(c); } });
  }
  const read = () => readComputed(c);
  const set = (v: unknown) => {
    if (S_deriv) throw writeInDerivation(c);
    try { readComputed(c, false); } catch { /* a throwing computation is replaced by the local value */ }
    if (!c.error && eq(c.equal, c.value, v)) return;
    if (DEV) devWrite(c);
    c.value = v; c.error = false; c.has = true;
    propagateFrom(c);
  };
  read.set = set;
  read.update = (fn: (v: unknown) => unknown) => set(fn(untracked(read)));
  return brand(read, c);
}

// ---------------------------------------------------------------- selector (B21)

export class SelectorNode implements RNode {
  deps: Link | undefined = undefined; depsTail: Link | undefined = undefined;
  subs = undefined; subsTail = undefined;
  flags = Watching;
  kind: Kind = 'selector';
  id = ++ids;
  name: string | undefined = undefined;
  value: unknown = undefined;
  keys = new Map<unknown, SignalNode>();
  source: () => unknown;
  owner: Owner | undefined;
  constructor(source: () => unknown) {
    this.source = source;
    this.owner = S_owner;
  }
}

const pendingSelectors: SelectorNode[] = [];

// B21.4: the source is re-read inside the write (not in the flush), so computeds over isSelected() stay
// read-your-writes (B3.1); its errors are routed in the next flush.
function runSelector(s: SelectorNode): void {
  if (s.flags === 0) return;
  s.depsTail = undefined;
  s.flags = Watching | RecursedCheck;
  const ctx = enter(s, undefined, s, undefined);
  ++cycle;
  let v: unknown;
  let threw = false;
  try { v = s.source(); } catch (e) { threw = true; deferred.push([e, s.owner]); schedule(); } finally {
    restore(ctx);
    s.flags &= ~RecursedCheck;
    purgeDeps(s);
  }
  if (threw || Object.is(v, s.value)) return;
  const old = s.value;
  s.value = v;
  const a = s.keys.get(old), b = s.keys.get(v);
  if (a) { a.value = false; propagateFrom(a); }
  if (b) { b.value = true; propagateFrom(b); }
}

function drainSelectors(): void {
  while (pendingSelectors.length) runSelector(pendingSelectors.shift()!);
}

export function selector(source: () => unknown): (key: unknown) => boolean {
  const s = new SelectorNode(source);
  S_owner?.onCleanup(() => { dropDeps(s); s.flags = 0; s.keys.clear(); });
  runSelector(s);
  return (key: unknown) => {
    if (DEV && (S_label || S_loader)) strictRead(s);
    if (S_sub && s.flags) {
      let k = s.keys.get(key);
      if (!k) {
        k = new SignalNode(Object.is(s.value, key), Object.is, undefined);
        k.selector = s;
        k.key = key;
        s.keys.set(key, k);
      }
      link(k, S_sub, cycle);
    }
    return Object.is(s.value, key);
  };
}

// ---------------------------------------------------------------- bindings

/** A binding: user function (a derivation) plus jasno's apply half (B4.5). Evaluates now (B4.7). */
export function bind(fn: () => unknown, apply: (v: any) => void, options?: BindingOptions): Binding {
  const b = new Binding(fn, apply, options);
  b.flags = Watching | RecursedCheck;
  if (DEV) b.total = 1;
  const ctx = enter(b, undefined, b, undefined);
  ++cycle;
  let v: unknown;
  try { v = fn(); } finally {
    restore(ctx);
    b.flags &= ~RecursedCheck;
    purgeDeps(b);
  }
  if (b.dead) { dropDeps(b); b.flags = 0; } // created under a disposed owner: applied once, never again
  if (DEV && b.usedUntracked && !b.deps) untrackedInDerivation(b, b.owner);
  b.value = v;
  apply(v); // first evaluation is part of setup: errors propagate (B8.2)
  return b;
}

function runBinding(b: Binding): void {
  if (b.dead || b.owner?.state) return;
  const f = b.flags;
  if (!(f & Dirty || (f & Pending && b.deps && checkDirty(b.deps, b)))) { b.flags = Watching; return; }
  count(b);
  b.depsTail = undefined;
  b.flags = Watching | RecursedCheck;
  b.usedUntracked = false;
  const ctx = enter(b, undefined, b, undefined);
  ++cycle;
  let v: unknown;
  let error: unknown;
  let threw = false;
  try { v = b.fn(); } catch (e) { threw = true; error = e; } finally {
    restore(ctx);
    b.flags &= ~RecursedCheck;
    purgeDeps(b);
  }
  if (threw) return handleError(error, b.owner);
  if (DEV && b.usedUntracked && !b.deps) untrackedInDerivation(b, b.owner);
  if (b.skip && Object.is(v, b.value)) return;
  b.value = v;
  const actx = enter(undefined, b.owner, undefined, undefined);
  try { b.apply(v); } catch (e) { handleError(e, b.owner); } finally { restore(actx); }
}

// ---------------------------------------------------------------- effects, onMount

export interface EffectContext { readonly abortSignal: AbortSignal }

/** An effect: an owner (child of its creator) whose only child is the owner of its current run (B6.1, B6.4). */
export class EffectNode extends Owner implements RNode {
  deps: Link | undefined = undefined; depsTail: Link | undefined = undefined;
  subs = undefined; subsTail = undefined;
  flags = 0;
  kind: Kind = 'effect';
  id = ++ids;
  seq = ++seqs;
  fn: (ctx: EffectContext) => void | Cleanup;
  run: Owner | undefined;
  first = true;
  running = false;
  epoch = 0; runs = 0; /** runs over its lifetime (__JASNO__ graph/inspect) */ total = 0;
  cause: WriteCause | undefined;
  /** dev: where it was created (EFFECT_LOOP names it, B4.6). */
  created: Error | undefined;
  constructor(parent: Owner | undefined, fn: (ctx: EffectContext) => void | Cleanup, name: string | undefined) {
    super(parent, name);
    this.fn = fn;
    if (DEV) { this.created = new Error(); registerNode(this); }
  }
}

class MountJob {
  seq = ++seqs;
  owner: Owner;
  fn: (ctx: EffectContext) => void | Cleanup;
  constructor(owner: Owner, fn: (ctx: EffectContext) => void | Cleanup) { this.owner = owner; this.fn = fn; }
}

function ownedInDerivation(kind: string): JasnoError {
  const d = S_deriv!;
  return new JasnoError('OWNED_IN_DERIVATION', `${kind} created inside ${d.kind} "${nameOf(d)}"; derivations have no owner.`,
    'Create it in setup or onMount; computed() stays pure.', { node: nameOf(d) });
}

/** B6.11 in both builds; mount() uses it too (its root is an owner). */
export function assertNotDerivation(kind: string): void {
  if (S_deriv) throw ownedInDerivation(kind);
}

export function checkOwned(kind: string): void {
  assertNotDerivation(kind);
  if (DEV && !S_owner) {
    const at = userFrame(new Error().stack);
    warn('NO_OWNER', `${kind} created outside any owner${at ? ` at ${at}` : ''}; it is never disposed.`,
      'Create it during setup or onMount; module-level app-lifetime work goes in createRoot(() => ...). signal() and computed() need no owner.',
      { ownerPath: '', node: kind });
  }
}

export function effect(fn: (ctx: EffectContext) => void | Cleanup, options?: { debugName?: string | undefined }): () => void {
  checkOwned('effect()');
  const e = new EffectNode(S_owner, fn, options?.debugName);
  if (!e.state) { queueB.push(e); schedule(); }
  return () => dispose(e);
}

function runEffect(e: EffectNode): void {
  if (e.state) return;
  const f = e.flags;
  if (!e.first && !(f & Dirty || (f & Pending && e.deps && checkDirty(e.deps, e)))) { e.flags = Watching; return; }
  count(e);
  if (e.run) {
    dispose(e.run); // the previous run's owner (B6.4)
    e.run = undefined;
    if (e.state) return; // one of its cleanups stopped the effect
  }
  const first = e.first;
  e.first = false;
  const run = (e.run = new Owner(e));
  e.depsTail = undefined;
  e.flags = Watching | RecursedCheck;
  e.running = true;
  const ctx = enter(e, run, undefined, e);
  ++cycle;
  let r: unknown;
  let threw = false;
  try { r = e.fn({ get abortSignal() { return signalOf(run); } }); } catch (err) { threw = true; handleError(err, run); } finally {
    restore(ctx);
    e.running = false;
    e.flags &= ~RecursedCheck;
    purgeDeps(e);
  }
  if (typeof r === 'function') run.onCleanup(r as Cleanup); // runs at once if the run was disposed (B6.5)
  if (e.state) {
    // Disposed during its own run (B6.5): finish now.
    disposeChildren(e); dropDeps(e); e.flags = 0; e.state = 2;
    e.parent?.children?.delete(e);
    return;
  }
  if (DEV && first && !threw && !e.deps) {
    warn('EFFECT_NO_DEPS', `Effect "${nameOf(e)}" read no signals, so it never re-runs.`,
      'Use onMount() for one-time work, or read the signals it should react to.', { ownerPath: ownerPath(e.parent), node: nameOf(e), owner: e });
  }
  if (e.flags & (Dirty | Pending)) { e.flags &= ~Watching; queueB.push(e); } // it wrote what it read (B5.3)
}

export function onMount(fn: (ctx: EffectContext) => void | Cleanup): void {
  checkOwned('onMount()');
  const o = S_owner ?? new Owner(undefined);
  if (o.state) return;
  queueB.push(new MountJob(o, fn));
  schedule();
}

function runMount(j: MountJob): void {
  const o = j.owner;
  if (o.state) return;
  const ctx = enter(undefined, o, undefined, undefined);
  let r: unknown;
  try { r = j.fn({ get abortSignal() { return signalOf(o); } }); } catch (err) { handleError(err, o); } finally { restore(ctx); }
  if (typeof r === 'function') o.onCleanup(r as Cleanup);
}

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  assertNotDerivation('createRoot()');
  const o = new Owner(S_owner, undefined);
  if (!S_owner) o.appRoot = true;
  return runOwned(o, () => fn(() => dispose(o)));
}

// ---------------------------------------------------------------- scheduler (B4)

const heap: Binding[] = [];
let queueB: (EffectNode | MountJob)[] = [];
let scheduled = false;
let flushing = false;
let phase = 0; // 1: (a) bindings, 2: (b) effects
let epoch = 0;
let ran: (Binding | EffectNode)[] = [];
let microFlushes = 0;

function heapPush(b: Binding): void {
  heap.push(b);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p]!.seq <= b.seq) break;
    heap[i] = heap[p]!; heap[i = p] = b;
  }
}

function heapPop(): Binding {
  const top = heap[0]!;
  const last = heap.pop()!;
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < heap.length && heap[l]!.seq < heap[m]!.seq) m = l;
      if (r < heap.length && heap[r]!.seq < heap[m]!.seq) m = r;
      if (m === i) break;
      heap[i] = heap[m]!; heap[m] = last; i = m;
    }
  }
  return top;
}

export function schedule(): void {
  if (scheduled || flushing) return;
  scheduled = true;
  queueMicrotask(microFlush);
}

let resetPort: MessagePort | undefined;
function microFlush(): void {
  if (!scheduled || flushing) return;
  scheduled = false;
  if (DEV) {
    // Async-loop guard (B4.10): microtask flushes with no macrotask between them.
    if (++microFlushes === 1 && typeof MessageChannel === 'function') {
      if (!resetPort) {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => { microFlushes = 0; };
        (ch.port1 as { unref?: () => void }).unref?.();
        resetPort = ch.port2;
      }
      resetPort.postMessage(0);
    }
    if (microFlushes > 1000) {
      microFlushes = 0;
      const e = loopError([]);
      dropQueues([]);
      return report(e);
    }
  }
  try { runFlush(); } catch (e) { report(e); }
}

/** True while a flush runs (the router's outlet created in a flush is a late outlet, B17.3). */
/** True while a flush runs (the router's late-outlet check, B17.3). */
export const isFlushing = (): boolean => flushing;
/** The running flush, or -1 between flushes: two calls in one flush return the same number. */
export const flushId = (): number => (flushing ? epoch : -1);

export function isIdle(): boolean {
  return !scheduled && !flushing && heap.length === 0 && queueB.length === 0 && deferred.length === 0;
}

export function flush(): void {
  if (S_deriv || S_setup) {
    throw new JasnoError('FLUSH_REENTRANT', `flush() was called inside ${S_deriv ? `${S_deriv.kind} "${nameOf(S_deriv)}"` : 'setup'}.`,
      'Call flush() from tests, handlers, effects or onMount, never from computed() or setup.', { ownerPath: ownerPath(S_owner) });
  }
  if (flushing) {
    // From an effect, onMount or a handler during phase (b): drain phase (a) and return (B4.2).
    if (phase === 2) { phase = 1; try { drainA(); } finally { phase = 2; } }
    return;
  }
  if (!scheduled && isIdle()) return;
  scheduled = false;
  runFlush();
}

function count(c: Binding | EffectNode): void {
  if (DEV) c.total++;
  if (c.epoch !== epoch) { c.epoch = epoch; c.runs = 0; ran.push(c); }
  if (++c.runs > CAP) throw loopError([c]);
}

function drainA(): void {
  while (heap.length) runBinding(heapPop());
}

function runFlush(): void {
  flushing = true;
  epoch++;
  ran = [];
  runningCause = flushCause;
  flushCause = undefined;
  let rounds = 0;
  hooks.flushStart?.();
  try {
    do {
      if (++rounds > CAP) throw loopError([]);
      while (deferred.length) { const [e, o] = deferred.shift()!; handleError(e, o); }
      phase = 1;
      drainA();
      phase = 2;
      const batch = queueB.sort((a, b) => a.seq - b.seq);
      queueB = [];
      for (const x of batch) x instanceof MountJob ? runMount(x) : runEffect(x);
    } while (heap.length || queueB.length || deferred.length);
  } catch (e) {
    const cap = (e as { capped?: (Binding | EffectNode)[] }).capped ?? [];
    dropQueues(cap);
    throw e;
  } finally {
    flushing = false;
    phase = 0;
    hooks.flushEnd?.();
    runningCause = undefined;
    if (heap.length || queueB.length) schedule(); // first runs kept after a loop cap
  }
}

/**
 * Loop cap (B4.6): clear the queue but keep subscriptions, and re-arm what was dropped so that its next source
 * change schedules it again (R2). Computeds between a dropped consumer and its sources are brought up to date
 * first (without notifying the consumer), or propagation would stop at them.
 */
function dropQueues(extra: (Binding | EffectNode)[]): void {
  const dropped = new Set<Binding | EffectNode>(extra);
  for (const b of heap) dropped.add(b);
  const keep: (EffectNode | MountJob)[] = [];
  for (const x of queueB) {
    if (x instanceof MountJob || x.first) keep.push(x); // first runs are not part of the loop
    else dropped.add(x);
  }
  heap.length = 0;
  queueB = keep;
  for (const c of dropped) {
    c.flags = 0;
    for (let l = c.deps; l; l = l.nextDep) if (l.dep instanceof ComputedNode && l.dep.flags & (Dirty | Pending)) refresh(l.dep);
    if (c instanceof EffectNode ? !c.state : !c.dead) c.flags = Watching;
  }
}

function loopError(extra: (Binding | EffectNode)[]): JasnoError {
  const top = [...new Set([...extra, ...ran])].sort((a, b) => b.runs - a.runs).slice(0, 3);
  const label = (c: Binding | EffectNode) => {
    if (c instanceof EffectNode) {
      const at = DEV ? userFrame(c.created?.stack) : undefined;
      return `${nameOf(c)}${at ? ` (${at})` : ''}`;
    }
    const path = ownerPath(c.owner);
    return `${nameOf(c)}${path ? ` in ${path}` : ''}`;
  };
  const names = top.map(label).join(', ') || 'consumers';
  const runs = top.reduce((s, c) => s + c.runs, 0);
  const stale = [...new Set([...heap, ...extra.filter((c) => c instanceof Binding)])].map(label).join(', ') || 'none';
  const e = new JasnoError('EFFECT_LOOP', `${names} kept re-triggering each other (${runs} runs); DOM may be stale in: ${stale}.`,
    'A consumer writes state it reads: derive it with computed()/linkedSignal(), or make the write conditional so it converges.',
    { node: top[0] && nameOf(top[0]) });
  Object.defineProperty(e, 'capped', { value: extra, enumerable: false });
  return e;
}

// ---------------------------------------------------------------- context (B13)

export interface Context<T> { readonly name: string; readonly has: boolean; readonly def: T | undefined }

export function createContext<T>(name: string, ...def: [] | [T]): Context<T> {
  return { name, has: def.length > 0, def: def[0] };
}

export function provide<T>(ctx: Context<T>, value: T, fn: () => Node): Node {
  const o = new Owner(S_owner, undefined);
  o.ctx = new Map([[ctx, value]]);
  return runOwned(o, fn);
}

export function useContext<T>(ctx: Context<T>): T {
  if (!S_owner) {
    throw new JasnoError('CONTEXT_OUTSIDE_OWNER', `useContext("${ctx.name}") was called outside component setup.`,
      'Call it during setup and keep the value in a const; handlers and code after await have no owner.');
  }
  for (let o: Owner | undefined = S_owner; o; o = o.parent) if (o.ctx?.has(ctx)) return o.ctx.get(ctx) as T;
  if (ctx.has) return ctx.def as T;
  throw new JasnoError('NO_PROVIDER', `No provider for context "${ctx.name}" in ${ownerPath(S_owner) || '<root>'}.`,
    `Wrap the subtree in provide(${ctx.name}, value, () => ...) or give createContext a default. A consumer passed as children was created before the provider: pass () => Child.`,
    { ownerPath: ownerPath(S_owner) });
}

// ---------------------------------------------------------------- dev introspection registry

const registry = new Map<number, WeakRef<RNode>>();
const finalizer = DEV ? new FinalizationRegistry<number>((id) => registry.delete(id)) : undefined;

function registerNode(n: RNode): void {
  registry.set(n.id, new WeakRef(n));
  finalizer!.register(n, n.id);
}

export function liveNodes(): RNode[] {
  const out: RNode[] = [];
  for (const ref of registry.values()) {
    const n = ref.deref();
    if (n && !n.dead && !(n instanceof EffectNode && n.state)) out.push(n);
  }
  return out;
}

export function findNode(target: number | string): RNode | undefined {
  if (typeof target === 'number') return registry.get(target)?.deref();
  return liveNodes().find((n) => n.name === target || `${n.kind}#${n.id}` === target);
}

export function whyOf(n: RNode): string[] | undefined {
  const c = describeCause(n.cause);
  return c ? [c, nameOf(n)] : undefined;
}

export function preview(v: unknown): string {
  let s: string;
  try { s = typeof v === 'function' ? 'function' : JSON.stringify(v) ?? String(v); } catch { s = String(v); }
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}
