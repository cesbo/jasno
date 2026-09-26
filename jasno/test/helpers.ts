// Test helpers: record diagnostics and routed errors without jasno/testing's per-test checks.
import { hooks } from '../src/core.ts';
import { diagHooks, type Diagnostic } from '../src/diag.ts';

export interface Capture {
  diags: Diagnostic[];
  errors: unknown[];
  codes(): string[];
  stop(): void;
}

export function capture(): Capture {
  const sink = diagHooks.sink, reporter = hooks.reporter;
  const c: Capture = {
    diags: [],
    errors: [],
    codes: () => c.diags.map((d) => d.code),
    stop: () => { diagHooks.sink = sink; hooks.reporter = reporter; },
  };
  diagHooks.sink = (d) => { if (!c.diags.includes(d)) c.diags.push(d); return true; };
  hooks.reporter = (e) => { c.errors.push(e); };
  return c;
}

export function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

export const tick = () => new Promise<void>((r) => setImmediate(r));

export function codeOf(e: unknown): string | undefined {
  return (e as { diag?: Diagnostic }).diag?.code;
}
