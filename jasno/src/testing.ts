// jasno/testing: mountTest and settled (design.md B19). Development build only.
import { Owner, flush, hooks, isIdle, ownerPath, report, resetOutsideSignals } from './core.ts';
import { JasnoError, diagHooks, type Diagnostic } from './diag.ts';
import { mount } from './dom.ts';

// Real timers, captured at import: mock.timers cannot hang settled().
const realSetTimeout = globalThis.setTimeout;
const realSetImmediate = globalThis.setImmediate as ((fn: () => void) => unknown) | undefined;
const now = () => performance.now();
const macrotask = () => new Promise<void>((r) => (realSetImmediate ? realSetImmediate(r) : realSetTimeout(r, 0)));

interface ActiveTest {
  owners: Set<Owner>;
  diags: Diagnostic[];
  copies: Map<Diagnostic, Diagnostic>;
  failures: Error[];
  expect: Set<string>;
  thrown: Set<unknown>;
}

let active: ActiveTest | undefined;
const pending = new Map<Promise<unknown>, string>();

function track(p: Promise<unknown>, what: string): void {
  pending.set(p, what);
  const done = () => { pending.delete(p); };
  p.then(done, done);
}

function uncaught(error: unknown, what: string, path = ''): void {
  const message = error instanceof Error ? error.message : String(error);
  const e = new JasnoError('UNCAUGHT_ERROR', `${what} threw: ${message}.`,
    'Fix the error, or wrap the subtree in catchError(() => ..., (err, reset) => ...).', { ownerPath: path });
  Object.defineProperty(e, 'cause', { value: error, configurable: true, writable: true });
  active!.failures.push(e);
}

const underAppRoot = (o: Owner): boolean => {
  for (let x: Owner | undefined = o; x; x = x.parent) if (x.appRoot) return true;
  return false;
};

hooks.pending = (p, name) => track(p, `loader of ${name}`);
hooks.handlerPromise = (p, what) => {
  track(p, what);
  p.then(undefined, (e) => (active ? uncaught(e, `The promise returned by the ${what}`) : report(e)));
};
hooks.ownerCreated = (o) => { active?.owners.add(o); };
hooks.reporter = (error, owner) => {
  if (!active) {
    const g = globalThis as { reportError?: (e: unknown) => void };
    if (typeof g.reportError === 'function') g.reportError(error);
    else queueMicrotask(() => { throw error; });
    return;
  }
  uncaught(error, `Reactive code in ${label(owner)}`, label(owner));
};

/** B19.2: an owner the test did not create (or one inside a module-level root) is tagged <module root>. */
const foreign = (o: unknown): boolean => o instanceof Owner && !!active && (!active.owners.has(o) || underAppRoot(o));

function label(o: Owner | undefined): string {
  const path = ownerPath(o) || '<root>';
  return foreign(o) ? `<module root> › ${path}` : path;
}

diagHooks.sink = (d, owner) => {
  const t = active;
  if (!t) return false;
  let copy = t.copies.get(d);
  if (!copy) {
    copy = foreign(owner) ? { ...d, ownerPath: `<module root> › ${d.ownerPath}` } : { ...d };
    t.copies.set(d, copy);
    t.diags.push(copy);
  } else {
    copy.count = d.count;
  }
  return true;
};

const asError = (d: Diagnostic): Error => {
  const e = new Error(`${d.message} hint: ${d.hint} docs: ${d.docs}`);
  Object.defineProperty(e, 'diag', { value: d });
  return e;
};

/** Problems recorded so far that were not thrown yet. */
function problems(t: ActiveTest): unknown[] {
  const out: unknown[] = [];
  for (const d of t.diags) if ((d.severity === 'warn' || d.severity === 'error') && !t.expect.has(d.code)) out.push(d);
  out.push(...t.failures);
  return out.filter((x) => !t.thrown.has(x));
}

function throwAll(t: ActiveTest, list: unknown[]): void {
  if (!list.length) return;
  for (const x of list) t.thrown.add(x);
  const errors = list.map((x) => (x instanceof Error ? x : asError(x as Diagnostic)));
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(errors, `${errors.length} problems: ${errors.map((e) => e.message.split(' hint:')[0]).join(' | ')}`);
}

export interface TestContextLike { after(fn: () => void): void }

export function mountTest(t: TestContextLike, view: () => Node, options: { expect?: readonly string[] | undefined } = {}) {
  const test: ActiveTest = { owners: new Set(), diags: [], copies: new Map(), failures: [], expect: new Set(options.expect ?? []), thrown: new Set() };
  active = test;
  const root = document.createElement('div');
  document.body.append(root);
  let unmount: () => void;
  try {
    unmount = mount(view, root);
  } catch (e) {
    root.remove();
    active = undefined;
    throw e;
  }
  let disposed = false;
  const api = {
    root,
    get diagnostics(): readonly Diagnostic[] { return test.diags.slice(); },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unmount();
      root.remove();
      const list = problems(test);
      for (const code of test.expect) {
        if (!test.diags.some((d) => d.code === code)) {
          list.push(new JasnoError('EXPECTED_DIAGNOSTIC_MISSING', `Expected diagnostic ${code} did not occur.`,
            'Remove it from expect, or make the test reach that case.'));
        }
      }
      const leaked = [...test.owners].filter((o) => o.state === 0 && !underAppRoot(o));
      if (leaked.length) {
        const paths = [...new Set(leaked.map((o) => ownerPath(o) || (o.parent ? ownerPath(o.parent) : '(no owner)')))].join(', ');
        list.push(new JasnoError('EFFECT_LEAKED', `${leaked.length} owners created by this test are alive after unmount: ${paths}.`,
          'Create effects and resources during setup or onMount, not in handlers or after await.'));
      }
      if (active === test) active = undefined;
      resetOutsideSignals();
      throwAll(test, list);
    },
  };
  t.after(() => api.dispose()); // registered before the first flush, which may throw (EFFECT_LOOP)
  flush();
  return api;
}

export async function settled(options: { timeout?: number | undefined } = {}): Promise<void> {
  const timeout = options.timeout ?? 2000;
  const start = now();
  for (;;) {
    flush();
    if (active) throwAll(active, problems(active));
    if (pending.size === 0 && isIdle()) {
      await macrotask();
      flush();
      if (pending.size === 0 && isIdle()) {
        if (active) throwAll(active, problems(active));
        return;
      }
      continue;
    }
    const left = timeout - (now() - start);
    if (left <= 0) {
      const list = [...pending.values(), ...(isIdle() ? [] : ['the flush queue'])].join(', ');
      throw new JasnoError('SETTLE_TIMEOUT', `settled() timed out after ${timeout} ms; pending: ${list}.`,
        'Stub fetch or provide a fake service; raise timeout only for slow real work.');
    }
    await Promise.race([Promise.allSettled([...pending.keys()]), new Promise((r) => realSetTimeout(r, Math.min(left, 25)))]);
    await macrotask();
  }
}
