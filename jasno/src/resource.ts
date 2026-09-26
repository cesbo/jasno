// resource(): async state bound to params (design.md B9). The state is a pure function of params() and the
// request record; a request binding starts loads in phase (a).
import { DEV } from '#dev';
import {
  abortReason, bind, brand, checkOwned, computedNode, currentOwner, hooks, rawSignal, readComputed, readSignal, runBare,
  ownerPath, runLoader, strictLabel, untracked, writeRaw,
} from './core.ts';
import { JasnoError, warn } from './diag.ts';

type Status = 'idle' | 'loading' | 'reloading' | 'resolved' | 'error' | 'local';

interface State {
  readonly status: Status;
  readonly params?: unknown;
  readonly version?: number;
  readonly value?: unknown;
  readonly has: boolean;
  readonly error?: unknown;
}

const IDLE: State = { status: 'idle', has: false };
const LOADING: State = { status: 'loading', has: false };
const NONE = Symbol('none');
/** Params when the option is omitted: a constant defined value (B9.2). */
const ONCE = Symbol('once');

/** B9.3: Object.is, except plain objects and arrays compare one level deep. */
export function paramsEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false; // holes compare as undefined
    return true;
  }
  if (!plain(a) || !plain(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && Object.is(a[k], b[k]));
}

function plain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

let resources = 0;

export function resource(options: {
  params?: (() => unknown) | undefined;
  loader: (ctx: { params: unknown; abortSignal: AbortSignal }) => Promise<unknown>;
  debugName?: string | undefined;
}): unknown {
  checkOwned('resource()');
  const owner = currentOwner();
  const { loader } = options;
  const name = options.debugName ?? `resource#${++resources}`;
  const params = computedNode(options.params ?? (() => ONCE), { equal: paramsEqual, debugName: `${name}.params` });
  const record = rawSignal(undefined as State | undefined, `${name} request`);
  const tick = rawSignal(0, `${name} reload`);
  let ac: AbortController | undefined;
  let version = 0;
  let last: unknown = NONE;
  let needStart = false;
  let disposed = !!owner?.state; // created under a disposed owner (B6.2): never requests

  const state = computedNode((): State => {
    let p: unknown;
    try { p = readComputed(params); } catch (error) { return { status: 'error', has: false, error }; }
    if (p === undefined) return IDLE;
    const r = readSignal(record) as State | undefined;
    return r && paramsEqual(r.params, p) ? r : LOADING;
  }, { debugName: `${name} state` });

  const abort = (): void => {
    const c = ac;
    ac = undefined;
    if (c) runBare(() => c.abort(abortReason()));
  };

  const call = (v: number, p: unknown): void => {
    const c = (ac = new AbortController());
    const promise = runLoader(name, owner, () => Promise.try(loader, { params: p === ONCE ? undefined : p, abortSignal: c.signal }));
    // settled() waits until the result can count: it settles, or jasno aborts the request (B19.6, B7.4).
    if (hooks.pending) {
      const aborted = new Promise<void>((r) => runBare(() => c.signal.addEventListener('abort', () => r(), { once: true })));
      hooks.pending(Promise.race([promise, aborted]), name);
    }
    const settle = (status: 'resolved' | 'error', x: unknown): void => {
      // B9.6, B7.4: only the current request counts, and not when jasno aborted it.
      if (v !== version || c.signal.aborted || disposed) return;
      const r = record.value as State;
      writeRaw(record, status === 'resolved'
        ? { status, params: r.params, version: v, value: x, has: true }
        : { status, params: r.params, version: v, has: false, error: x });
    };
    promise.then((x) => settle('resolved', x), (e) => settle('error', e));
  };

  const start = (p: unknown): void => {
    abort();
    const v = ++version;
    writeRaw(record, { status: 'loading', params: p, version: v, has: false });
    call(v, p);
  };

  // The request binding (B9.5): params at creation, then in phase (a) whenever params change or reload() ran.
  bind(() => {
    readSignal(tick);
    try { return { p: readComputed(params) }; } catch { return { p: undefined }; }
  }, (x: { p: unknown }) => {
    if (disposed) return;
    if (x.p === undefined) {
      // idle (or throwing params): forget the request, so the same params later start as 'loading' (B9.14)
      abort(); last = NONE; needStart = false; writeRaw(record, undefined); return;
    }
    if (last === NONE || !paramsEqual(x.p, last)) { last = x.p; needStart = false; start(x.p); return; }
    if (needStart) { needStart = false; call(version, x.p); }
  }, { skip: false, name: `${name} request` });

  owner?.onCleanup(() => { disposed = true; abort(); });

  /** Current params for reload()/set(): undefined when idle, throwing or disposed. */
  const currentParams = (): unknown => {
    if (disposed) return undefined;
    try { return untracked(() => readComputed(params, false)); } catch { return undefined; }
  };
  const now = (): State => runBare(() => readComputed(state, false) as State);

  const reload = (): void => {
    const p = currentParams();
    if (p === undefined) return;
    const s = now();
    abort();
    const v = ++version;
    writeRaw(record, s.has
      ? { status: 'reloading', params: p, version: v, value: s.value, has: true }
      : { status: 'loading', params: p, version: v, has: false });
    last = p;
    needStart = true;
    writeRaw(tick, (tick.value as number) + 1);
  };

  const set = (value: unknown): void => {
    const p = currentParams();
    if (p === undefined) return;
    if (DEV && now().status === 'loading') {
      warn('RESOURCE_SET_WHILE_LOADING', `set() on resource "${name}" while it loads ${JSON.stringify(p === ONCE ? null : p) ?? String(p)}; the value likely belongs to earlier params.`,
        "Capture the params before the await and write only if they are unchanged; optimistic values are set() before the await (this warning never fires in 'reloading').",
        { node: name, ownerPath: ownerPath(owner), owner });
    }
    abort();
    last = p;
    needStart = false;
    writeRaw(record, { status: 'local', params: p, version: ++version, value, has: true });
  };

  const field = <T>(key: string, fn: (s: State) => T) => {
    const c = computedNode(() => fn(readComputed(state) as State), { debugName: `${name}.${key}` });
    return brand(() => readComputed(c), c);
  };
  const valueNode = computedNode(() => {
    const s = readComputed(state) as State;
    if (s.status === 'error') throw s.error;
    return s.value;
  }, { debugName: `${name}.value` });
  const value = brand(() => {
    if (DEV && strictLabel()) {
      const s = now().status;
      if (s === 'idle' || s === 'loading') {
        throw new JasnoError('PENDING_READ_UNTRACKED', `Resource "${name}" was read in ${strictLabel()} while ${s}; that snapshot would stay undefined.`,
          'Read it inside a function: show(() => r.hasValue() && r.value(), (v) => ...).', { node: name });
      }
    }
    return readComputed(valueNode);
  }, valueNode);
  const has = field('hasValue', (s) => s.has && (s.status === 'resolved' || s.status === 'local' || s.status === 'reloading'));

  return {
    value,
    status: field('status', (s) => s.status),
    error: field('error', (s) => (s.status === 'error' ? s.error : undefined)),
    isLoading: field('isLoading', (s) => s.status === 'loading' || s.status === 'reloading'),
    hasValue: () => has(),
    reload,
    set,
  };
}
