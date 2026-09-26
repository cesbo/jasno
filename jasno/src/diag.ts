// Diagnostics: the "[CODE] message" format, deduplication, first user stack frame, delivery (console, __JASNO__,
// the jasno/testing recorder). Codes and templates: design.md (c).

export type Severity = 'error' | 'warn' | 'info';

export interface Diagnostic {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly hint: string;
  readonly docs: string;
  readonly ownerPath: string;
  readonly node?: string | undefined;
  readonly loc?: string | undefined;
  count: number;
}

export interface DiagInfo {
  ownerPath?: string | undefined;
  node?: string | undefined;
  region?: string | undefined;
  /** Extra deduplication key (EFFECT_WRITES_STATE dedupes per effect and signal). */
  key?: string | undefined;
  /** Owner the event belongs to (jasno/testing tags events from owners the test did not create). */
  owner?: unknown;
}

const docsOf = (code: string) => `node_modules/jasno/errors/${code}.md`;

/** Errors jasno creates: message starts with [CODE]; the Diagnostic is on error.diag (B8.7). */
export class JasnoError extends Error {
  readonly diag: Diagnostic;
  constructor(code: string, message: string, hint: string, info: DiagInfo = {}, Base: ErrorConstructor = Error) {
    const loc = userFrame(new Error().stack);
    const diag = make(code, 'error', message, hint, info, loc);
    super(`${diag.message} hint: ${hint} docs: ${diag.docs}`);
    if (Base !== Error) Object.setPrototypeOf(this, Base.prototype);
    this.name = Base === Error ? 'JasnoError' : Base.name;
    this.diag = diag;
  }
}

function make(code: string, severity: Severity, message: string, hint: string, info: DiagInfo, loc: string | undefined): Diagnostic {
  const where = [loc && `at ${loc}`, info.ownerPath && `in ${info.ownerPath}`].filter(Boolean).join(' ');
  return {
    code, severity, hint, docs: docsOf(code),
    message: `[${code}] ${message}${where ? ` (${where})` : ''}`,
    ownerPath: info.ownerPath ?? '', node: info.node, loc, count: 1,
  };
}

const seen = new Map<string, Diagnostic>();
const log: Diagnostic[] = [];

/** jasno/testing installs a sink; it returns true when it took the event (no console output then). */
export const diagHooks: { sink: ((d: Diagnostic, owner: unknown) => boolean) | undefined } = { sink: undefined };

/** Reports a warn-level diagnostic (dev builds only; callers guard with DEV). */
export function warn(code: string, message: string, hint: string, info: DiagInfo = {}): Diagnostic {
  const loc = userFrame(new Error().stack);
  // Per (code, region, node, call site); an explicit key replaces all but the code (B5.3: once per effect and signal).
  const key = (info.key ? [code, info.key] : [code, info.region ?? info.ownerPath, info.node, loc]).join('\u0000');
  const old = seen.get(key);
  if (old) {
    old.count++;
    diagHooks.sink?.(old, info.owner);
    return old;
  }
  const d = make(code, 'warn', message, hint, info, loc);
  seen.set(key, d);
  log.push(d);
  if (!diagHooks.sink?.(d, info.owner)) console.warn(`${d.message} hint: ${hint} docs: ${d.docs}`);
  return d;
}

export function diagnostics(filter: { code?: string | undefined; severity?: Severity | undefined } = {}): readonly Diagnostic[] {
  return log.filter((d) => (!filter.code || d.code === filter.code) && (!filter.severity || d.severity === filter.severity));
}

export function clearDiagnostics(): void {
  seen.clear();
  log.length = 0;
}

// ---------------------------------------------------------------- stack frames

const ownDir = new URL('.', import.meta.url).href;
const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '';

/** First stack frame outside jasno and the platform, e.g. "src/views/user.ts:42:17". */
export function userFrame(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  for (const line of stack.split('\n').slice(1)) {
    const m = /((?:file|https?):\/\/[^\s()]+?):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m || m[1]!.startsWith(ownDir) || m[1]!.includes('/node_modules/')) continue;
    let file = m[1]!;
    if (file.startsWith('file://')) {
      file = decodeURIComponent(new URL(file).pathname);
      if (cwd && file.startsWith(cwd + '/')) file = file.slice(cwd.length + 1);
    } else if (typeof location === 'object' && file.startsWith(location.origin)) {
      file = file.slice(location.origin.length + 1);
    }
    return `${file}:${m[2]}:${m[3]}`;
  }
  return undefined;
}
