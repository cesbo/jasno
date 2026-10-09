// DOM layer: h/svg elements (B15), components (B14), show/match (B10), each (B11), catchError (B8.5), mount (B16),
// css (B18), focus-loss and accessible-name checks (B15.10, B20), LEAK_IN_SETUP (B12.8).
import { DEV } from '#dev';
import {
  DROP, Owner, assertNotDerivation, bind, checkOwned, currentFlushCause, currentOwner, dispose, hooks, isInside, ownerPath,
  rawSignal, readSignal, readerOf, regionLabel, runBare, runDerived, runSetup, schedule, strictLabel, writeRaw,
  type RNode, type SignalNode,
} from './core.ts';
import { JasnoError, warn } from './diag.ts';
import { FORBIDDEN_PROPS, GLOBAL_PROPS, TAG_PROPS } from '#props';

type Props = Record<string, unknown>;
type Child = unknown;

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------- dev bookkeeping

/** Element → owner that created it (B14.4): __JASNO__.inspect(node), NODE_OUTSIDE_REGION. */
export const elementOwner = new WeakMap<Node, Owner | undefined>();
/** Watched nodes (a layout's p.view, B17.5) → the owner whose setup appended them. */
export const placedBy = new WeakMap<Node, Owner | undefined>();
const unnamed: { el: Element; tries: number }[] = [];
const INTERACTIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'dialog', 'meter', 'progress']);

function noteElement(el: Element): void {
  elementOwner.set(el, currentOwner());
  if (INTERACTIVE.has(el.localName)) unnamed.push({ el, tries: 0 });
}

const pathOfNode = (n: Node): string => ownerPath(elementOwner.get(n)) || '<root>';
const here = (): { ownerPath: string; owner: Owner | undefined } => ({ ownerPath: ownerPath(currentOwner()), owner: currentOwner() });

// ---------------------------------------------------------------- elements

export const h = new Proxy({} as Record<string, (props: Props | null, ...children: Child[]) => HTMLElement>, {
  get(cache: Record<string, unknown>, tag) {
    if (typeof tag !== 'string' || tag === 'then') return undefined;
    return (cache[tag] ??= (props: Props | null, ...children: Child[]) => element(tag, props, children));
  },
});

/** A select's re-apply of its bound value/selectedIndex, run when a region inside it changes (B15.9). */
const selectReapply = new WeakMap<Node, () => void>();

function element(tag: string, props: Props | null, children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (DEV) noteElement(el);
  let deferred: string[] | undefined;
  if (props) {
    if ('type' in props) applyProp(el, 'type', props.type);
    for (const key in props) {
      if (key === 'type') continue;
      if (tag === 'select' && (key === 'value' || key === 'selectedIndex')) { (deferred ??= []).push(key); continue; }
      applyProp(el, key, props[key]);
    }
  }
  appendAll(el, children);
  if (deferred) {
    const again: (() => void)[] = [];
    for (const key of deferred) {
      const set = setter(el, key);
      let last: unknown;
      live(props![key], (v) => { last = v; set(v); }, key);
      again.push(() => { if (last !== undefined) set(last); });
    }
    selectReapply.set(el, () => { for (const f of again) f(); });
  }
  return el;
}

/** svg.tag(attributes | null, ...children) (B15.11): the element in the SVG namespace, attributes set with setAttribute. */
export const svg = new Proxy({} as Record<string, (attributes: Props | null, ...children: Child[]) => SVGElement>, {
  get(cache: Record<string, unknown>, tag) {
    if (typeof tag !== 'string' || tag === 'then') return undefined;
    return (cache[tag] ??= (attributes: Props | null, ...children: Child[]) => svgElement(tag, attributes, children));
  },
});

function svgElement(tag: string, attributes: Props | null, children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  if (DEV) noteElement(el);
  for (const key in attributes) {
    const v = attributes[key];
    if (key.startsWith('on')) { if (typeof v === 'function') listen(el, key.slice(2), v as Handler); continue; }
    live(v, (x) => (x == null ? el.removeAttribute(key) : el.setAttribute(key, String(x))), key);
  }
  appendAll(el, children);
  return el;
}

function live(v: unknown, set: (x: unknown) => void, name: string): void {
  if (typeof v === 'function') bind(v as () => unknown, set, { name: `binding ${name}` });
  else set(v);
}

function unknownProp(el: Element, key: string, hint: string): void {
  warn('UNKNOWN_PROP', `<${el.localName}> got unknown prop "${key}".`, hint, { ...here(), node: key });
}

function applyProp(el: HTMLElement, key: string, v: unknown): void {
  if (key.startsWith('on')) {
    if (DEV && /[A-Z]/.test(key) && key.toLowerCase() in el) unknownProp(el, key, `Event props are lowercase DOM names: ${key.toLowerCase()}.`);
    if (typeof v === 'function') listen(el, key.slice(2), v as Handler);
    return;
  }
  if (key === 'class' && v !== null && typeof v === 'object') {
    for (const c in v as Props) live((v as Props)[c], (x) => el.classList.toggle(c, !!x), `class.${c}`);
    return;
  }
  if (key === 'style' && v !== null && typeof v === 'object') {
    for (const p in v as Props) {
      live((v as Props)[p], (x) => {
        if (p.startsWith('--')) x == null ? el.style.removeProperty(p) : el.style.setProperty(p, String(x));
        else (el.style as unknown as Props)[p] = x == null ? '' : x;
      }, `style.${p}`);
    }
    return;
  }
  live(v, setter(el, key), key);
}

/** Attribute names of reflected properties whose name differs from the lowercased property. */
const ATTR: Record<string, string> = { htmlFor: 'for', className: 'class', acceptCharset: 'accept-charset', httpEquiv: 'http-equiv' };

function setter(el: HTMLElement, key: string): (v: unknown) => void {
  if (key.startsWith('aria-')) {
    if (DEV && !GLOBAL_PROPS.has(key)) unknownProp(el, key, 'Use one of the aria-* attributes listed in jasno.elements.d.ts.');
    return (v) => (v == null ? el.removeAttribute(key) : el.setAttribute(key, String(v)));
  }
  if (key.startsWith('data-')) {
    return (v) => {
      if (v === true) el.setAttribute(key, '');
      else if (typeof v === 'string' || typeof v === 'number') el.setAttribute(key, String(v));
      else el.removeAttribute(key);
    };
  }
  const known = GLOBAL_PROPS.has(key) || !!TAG_PROPS[el.localName]?.includes(key);
  if (DEV && !known) {
    unknownProp(el, key, FORBIDDEN_PROPS[key] ? `jasno: ${FORBIDDEN_PROPS[key]}.` : 'Check the prop name against jasno.elements.d.ts (onClick → onclick, className → class, for → htmlFor).');
  }
  // list and form: the property is a readonly element reference, so the prop sets the attribute, an id (B15.4).
  if (key === 'list' || key === 'form') return (v) => (v == null ? el.removeAttribute(key) : el.setAttribute(key, String(v)));
  const prop = key === 'class' ? 'className' : key;
  const attr = ATTR[prop] ?? prop.toLowerCase();
  if (known && !(prop in el)) {
    // A typed prop this engine does not reflect (happy-dom lacks autofocus, enterKeyHint ...): set the attribute.
    return (v) => (v == null || v === false ? el.removeAttribute(attr) : el.setAttribute(attr, v === true ? '' : String(v)));
  }
  const target = el as unknown as Props;
  const initial = target[prop];
  const hadAttr = el.hasAttribute(attr);
  const keepCaret = prop === 'value' || prop === 'checked' || prop === 'selectedIndex';
  let first = true;
  return (v) => {
    const creating = first;
    first = false;
    if (v === undefined) {
      if (creating) return; // skipped at creation (B15.5)
      if (!keepCaret && !hadAttr && el.hasAttribute(attr)) { el.removeAttribute(attr); return; } // back to no attribute: no href=""
      v = initial;
    }
    // Always at creation: before its text is appended an option's value reads '', so value: '' looked unchanged
    // and the placeholder option took its text as value (a required select never reported valueMissing).
    if (creating || !keepCaret || target[prop] !== v) target[prop] = v;
  };
}

// ---------------------------------------------------------------- handlers (B15.7)

type Handler = (this: Element, ev: Event) => unknown;

function listen(el: Element, type: string, fn: Handler): void {
  el.addEventListener(type, (ev) => {
    const before = DEV && type === 'keydown' ? document.activeElement : null;
    const r = runBare(() => fn.call(el, ev));
    if (r && typeof (r as Promise<unknown>).then === 'function') hooks.handlerPromise?.(r as Promise<unknown>, `${type} handler in ${pathOfNode(el)}`);
    if (!DEV) return;
    if (type === 'submit' && !ev.defaultPrevented && el instanceof HTMLFormElement && !el.hasAttribute('action') && el.method !== 'dialog') {
      warn('SUBMIT_NOT_PREVENTED', `The submit handler of <form> in ${pathOfNode(el)} did not call preventDefault(); the browser will navigate.`,
        'Call e.preventDefault() first in onsubmit.', { ownerPath: pathOfNode(el), owner: elementOwner.get(el) });
    }
    const k = ev as KeyboardEvent;
    if (type === 'keydown' && k.key === 'Enter' && !k.isComposing && !ev.defaultPrevented) {
      queueMicrotask(() => {
        const now = document.activeElement;
        if (!now || now === before || !activates(now)) return;
        warn('KEY_ACTIVATES_NEW_FOCUS',
          `The Enter keydown handler in ${pathOfNode(el)} moved focus from <${before?.localName ?? 'body'}> to <${now.localName}> without preventDefault(); in Chromium the same key press will activate <${now.localName}>.`,
          'Call e.preventDefault() in that branch, or save through a form: h.form({ onsubmit: (e) => { e.preventDefault(); ... } }) handles Enter (RECIPES Inline edit).',
          { ownerPath: pathOfNode(el), owner: elementOwner.get(el) });
      });
    }
  });
}

function activates(el: Element): boolean {
  if (el.matches('button, a[href], summary, textarea')) return true;
  return el instanceof HTMLInputElement && el.form !== null;
}

// ---------------------------------------------------------------- children (B15.6)

function appendAll(parent: Node, children: readonly Child[]): void {
  for (const c of children) append(parent, c);
}

function append(parent: Node, c: Child): void {
  if (c == null || typeof c === 'boolean') return;
  if (Array.isArray(c)) { appendAll(parent, c); return; }
  if (typeof c === 'function') { parent.appendChild(liveText(c as () => unknown)); return; }
  if (c instanceof Node) {
    if (DEV && placedBy.has(c)) placedBy.set(c, currentOwner());
    if (DEV && c.parentNode && !(c instanceof DocumentFragment)) {
      warn('NODE_MOVED', `<${(c as Element).localName ?? c.nodeName}> already had a parent and was moved into ${ownerPath(currentOwner()) || '<root>'}.`,
        'A node lives in one place: create it where it is used (a function returning a new node); render children once.', here());
    }
    parent.appendChild(c);
    return;
  }
  parent.appendChild(document.createTextNode(String(c)));
}

function liveText(fn: () => unknown): Text {
  const t = document.createTextNode('');
  bind(fn, (v) => {
    if (DEV && v instanceof Node) {
      throw new JasnoError('NODE_IN_TEXT_BINDING', `A function child in ${ownerPath(currentOwner()) || '<root>'} returned <${(v as Element).localName ?? v.nodeName}>; function children are live text.`,
        'Lists use each(list, { key, render }); switches use show(when, then, otherwise) or match(key, render).',
        { ownerPath: ownerPath(currentOwner()) });
    }
    t.data = v == null || typeof v === 'boolean' ? '' : String(v);
  }, { name: 'binding text' });
  return t;
}

export function fragmentOf(c: Child): DocumentFragment {
  const f = document.createDocumentFragment();
  append(f, c);
  return f;
}

// ---------------------------------------------------------------- regions

/** Content between two empty Text nodes (B10.4). */
export class Region {
  start = document.createTextNode('');
  end = document.createTextNode('');
  /** Holds the markers (and the first content) until the region is inserted. */
  frag = document.createDocumentFragment();
  constructor() { this.frag.append(this.start, this.end); }
  fragment(): DocumentFragment { return this.frag; }
  nodes(): Node[] {
    const out: Node[] = [];
    for (let n = this.start.nextSibling; n && n !== this.end; n = n.nextSibling) out.push(n);
    return out;
  }
  clear(): void {
    for (const n of this.nodes()) n.parentNode!.removeChild(n);
  }
  insert(f: Node): void {
    this.end.parentNode!.insertBefore(f, this.end);
  }
  /** B15.9: a select around this region re-applies its bound value. */
  changed(): void {
    let p = this.end.parentNode;
    if (p?.nodeName === 'OPTGROUP') p = p.parentNode;
    if (p) selectReapply.get(p)?.();
  }
}

const hasFocus = (nodes: Node[]): boolean => {
  const a = document.activeElement;
  return !!a && nodes.some((n) => n === a || n.contains(a));
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex], [contenteditable]';

/**
 * B8.5, like the router (B17.8): the first focusable element of the new content, else its first element (given
 * tabindex="-1", so an alert text is read out). Returns false when the content is only text.
 */
function focusInto(nodes: Node[]): boolean {
  const elements = nodes.filter((n): n is HTMLElement => n instanceof Element);
  for (const n of elements) {
    const el = n.matches(FOCUSABLE) ? n : n.querySelector<HTMLElement>(FOCUSABLE);
    if (el) { el.focus(); return true; }
  }
  const first = elements[0];
  if (!first) return false;
  if (!first.hasAttribute('tabindex')) first.tabIndex = -1;
  first.focus();
  return true;
}

/** Focused elements a region already handled (catchError swaps, B20.3): the focus-loss check skips them. */
const focusHandled = new WeakSet<Element>();
/** Focused elements a catchError swap could not restore (text-only content): FOCUS_LOST gets this hint. */
const focusHint = new WeakMap<Element, string>();

/** The focused element if it is inside the region (before a boundary swaps the content, B8.5). */
export const focusedIn = (r: Region): Element | null => (hasFocus(r.nodes()) ? document.activeElement : null);

/** After a boundary swap: focus into the new content, or leave FOCUS_LOST a hint (B8.5, B20.3). */
export function restoreFocusIn(r: Region, focused: Element | null): void {
  if (!focused) return;
  if (focusInto(r.nodes())) focusHandled.add(focused);
  else focusHint.set(focused, "The catchError content that replaced it is only text: wrap it in an element, h.p({ role: 'alert' }, '...'), and jasno focuses it (B8.5).");
}

function outsideCheck(result: unknown, o: Owner, parent: Owner | undefined, kind: string): void {
  if (result instanceof Element && elementOwner.has(result) && !isInside(elementOwner.get(result), o)) {
    warn('NODE_OUTSIDE_REGION', `${kind} builder in ${ownerPath(parent) || '<root>'} returned <${result.localName}>, created outside it.`,
      'Create the node inside the builder, or keep it mounted and toggle hidden: () => !open().',
      { ownerPath: ownerPath(parent), owner: parent });
  }
}

/** Runs a builder under a new owner in a guard (B8.9): on a throw the partial owner is disposed, nothing inserted. */
function build(parent: Owner | undefined, kind: string, fn: () => Child): { owner: Owner; frag: DocumentFragment } {
  const o = new Owner(parent, kind);
  try {
    const frag = runSetup(o, regionLabel(parent, kind), () => {
      const result = fn();
      if (DEV) outsideCheck(result, o, parent, kind);
      return fragmentOf(result); // function children bind under the branch owner
    });
    return { owner: o, frag };
  } catch (e) {
    dispose(o);
    throw e;
  }
}

export function show(when: () => unknown, then: (value: () => unknown) => Child, otherwise?: () => Child): Node {
  const parent = currentOwner();
  const r = new Region();
  const value = rawSignal(undefined, 'show value');
  const valueRead = readerOf(value);
  let cond: boolean | undefined;
  let branch: Owner | undefined;
  bind(when, (v) => {
    const t = !!v;
    if (t) writeRaw(value, v);
    if (t === cond) return;
    cond = t;
    if (branch) {
      dispose(branch);
      branch = undefined;
      if (parent?.state) return; // a cleanup error made a boundary replace this region
    }
    r.clear();
    const fn = t ? () => then(valueRead) : otherwise;
    if (fn) {
      const b = build(parent, 'show', fn);
      branch = b.owner;
      r.insert(b.frag);
    }
    r.changed();
  }, { name: 'show' });
  return r.fragment();
}

export function match(key: () => unknown, render: (key: unknown) => Child): Node {
  const parent = currentOwner();
  const r = new Region();
  let branch: Owner | undefined;
  bind(key, (k) => {
    if (branch) {
      dispose(branch);
      branch = undefined;
      if (parent?.state) return;
    }
    r.clear();
    const b = build(parent, 'match', () => render(k));
    branch = b.owner;
    r.insert(b.frag);
    r.changed();
  }, { name: 'match' });
  return r.fragment();
}

// ---------------------------------------------------------------- each (B11)

interface Row {
  owner: Owner;
  item: SignalNode;
  index: SignalNode;
  first: Node;
  last: Node;
  frag: DocumentFragment | undefined;
}

function rangeOf(row: Row): Node[] {
  const out: Node[] = [];
  for (let n: Node | null = row.first; n; n = n.nextSibling) { out.push(n); if (n === row.last) break; }
  return out;
}

function moveRow(row: Row, anchor: Node): void {
  const parent = anchor.parentNode!;
  const nodes = rangeOf(row);
  const moveBefore = (parent as { moveBefore?: (n: Node, ref: Node) => void }).moveBefore;
  if (typeof moveBefore === 'function') { for (const n of nodes) moveBefore.call(parent, n, anchor); return; }
  const active = document.activeElement as HTMLElement | null;
  const refocus = active && hasFocus(nodes);
  for (const n of nodes) parent.insertBefore(n, anchor);
  if (refocus && document.activeElement !== active) active.focus({ preventScroll: true });
}

/** Indices (into seq) of one longest strictly increasing subsequence. */
function lis(seq: number[]): Set<number> {
  const tails: number[] = [];
  const prev = new Array<number>(seq.length);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (seq[tails[mid]!]! < seq[i]!) lo = mid + 1; else hi = mid; }
    prev[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  }
  const out = new Set<number>();
  for (let i = tails.length ? tails[tails.length - 1]! : -1; i >= 0; i = prev[i]!) out.add(i);
  return out;
}

export function each(list: () => readonly unknown[], options: {
  key: (item: unknown, index: number) => string | number;
  render: (item: () => unknown, index: () => number, key: string | number) => Child;
}): Node {
  const { key, render } = options;
  const parent = currentOwner();
  const r = new Region();
  const label = regionLabel(parent, 'each row');
  const keyNode = { kind: 'binding', id: 0, name: 'each key', flags: 0 } as RNode;
  let rows = new Map<unknown, Row>();
  let order: Row[] = [];

  const createRow = (item: unknown, i: number, k: string | number): Row => {
    const o = new Owner(parent, 'each row');
    const itemSig = rawSignal(item, 'each item');
    const indexSig = rawSignal(i, 'each index');
    let frag: DocumentFragment;
    try {
      frag = runSetup(o, label, () => {
        const result = render(readerOf(itemSig), readerOf(indexSig), k);
        if (DEV) outsideCheck(result, o, parent, 'each row');
        return fragmentOf(result);
      });
    } catch (e) {
      dispose(o);
      throw e;
    }
    if (!frag.firstChild) frag.appendChild(document.createTextNode(''));
    return { owner: o, item: itemSig, index: indexSig, first: frag.firstChild!, last: frag.lastChild!, frag };
  };

  bind(list, (arr: readonly unknown[] | null | undefined) => {
    const items = arr ?? [];
    // Keys first, as a derivation (untracked, no owner, writes throw): a throwing key changes nothing.
    const keys = runDerived(keyNode, () => items.map((item, i) => {
      const k = key(item, i);
      const old = rows.get(k);
      if (DEV && (!old || old.item.value !== item)) {
        const again = key(item, i);
        if (!Object.is(k, again)) {
          warn('UNSTABLE_KEY', `each() key in ${ownerPath(parent) || '<root>'} returned ${String(k)}, then ${String(again)} for the same item.`,
            'Derive the key from the item, (item) => item.id; no random values, counters or Date.now().', { ownerPath: ownerPath(parent), owner: parent });
        }
      }
      return k;
    }));
    // Same keys in the same order: only items changed, so no row is created, disposed or moved, and indexes stay.
    let same = keys.length === order.length;
    for (let i = 0; same && i < keys.length; i++) same = rows.get(keys[i]) === order[i];
    if (same) {
      for (let i = 0; i < items.length; i++) writeRaw(order[i]!.item, items[i]);
      return;
    }
    const next: Row[] = [];
    const nextMap = new Map<unknown, Row>();
    let error: unknown;
    let failed = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i], k = keys[i]!;
      let row: Row | undefined;
      if (nextMap.has(k)) {
        if (DEV) {
          warn('DUPLICATE_KEY', `each() in ${ownerPath(parent) || '<root>'} got key ${String(k)} more than once.`,
            'Keys must be unique and stable, e.g. (item) => item.id.', { ownerPath: ownerPath(parent), node: String(k), owner: parent });
        }
      } else {
        row = rows.get(k);
        if (row) { writeRaw(row.item, item); writeRaw(row.index, i); }
      }
      if (!row) {
        try { row = createRow(item, i, k); } catch (e) {
          if (!failed) { failed = true; error = e; }
          continue; // key not recorded: the next update retries this row (B8.9)
        }
      }
      if (!nextMap.has(k)) nextMap.set(k, row);
      next.push(row);
    }
    const kept = new Set(next);
    const stay: Row[] = [];
    for (const row of order) {
      if (kept.has(row)) { stay.push(row); continue; }
      dispose(row.owner);
      for (const n of rangeOf(row)) n.parentNode?.removeChild(n);
    }
    if (parent?.state) {
      // A row cleanup error made a boundary replace this region: drop what this pass built.
      for (const row of next) if (row.frag) dispose(row.owner);
      return;
    }
    reorder(stay, next);
    order = next;
    rows = nextMap;
    r.changed();
    if (failed) throw error;
  }, { name: 'each' });

  function reorder(prev: Row[], next: Row[]): void {
    let s = 0;
    while (s < prev.length && s < next.length && prev[s] === next[s]) s++;
    let pe = prev.length - 1, ne = next.length - 1;
    while (pe >= s && ne >= s && prev[pe] === next[ne]) { pe--; ne--; }
    const oldPos = new Map<Row, number>();
    for (let i = s; i <= pe; i++) oldPos.set(prev[i]!, i);
    const idx: number[] = [], seq: number[] = [];
    for (let i = s; i <= ne; i++) {
      const p = oldPos.get(next[i]!);
      if (p !== undefined) { idx.push(i); seq.push(p); }
    }
    const stable = new Set<number>();
    for (const j of lis(seq)) stable.add(idx[j]!);
    let anchor: Node = ne + 1 < next.length ? next[ne + 1]!.first : r.end;
    for (let i = ne; i >= s; i--) {
      const row = next[i]!;
      if (row.frag) { anchor.parentNode!.insertBefore(row.frag, anchor); row.frag = undefined; }
      else if (!stable.has(i)) moveRow(row, anchor);
      anchor = row.first;
    }
  }

  return r.fragment();
}

// ---------------------------------------------------------------- catchError (B8.5)

export function catchError(tryFn: () => Child, fallback: (error: unknown, reset: () => void) => Child): Node {
  const parent = currentOwner();
  const r = new Region();
  const attempt = rawSignal(0, 'catchError attempt');
  let current: Owner | undefined;

  /** Removes the current content; returns the focused element if it was inside (B8.5). */
  const clear = (): Element | null => {
    const focused = focusedIn(r);
    if (current) {
      if (current.boundary) current.boundary = DROP; // errors from the subtree being replaced are dropped
      dispose(current);
      current = undefined;
    }
    if (parent?.state) return null;
    r.clear();
    return focused;
  };
  const restoreFocus = (focused: Element | null): void => restoreFocusIn(r, focused);
  const showFallback = (error: unknown): void => {
    const b = build(parent, 'catchError', () => fallback(error, reset));
    current = b.owner;
    r.insert(b.frag);
  };
  const onError = (error: unknown): void => {
    const focused = clear();
    if (parent?.state) return;
    showFallback(error);
    r.changed();
    restoreFocus(focused);
  };
  const reset = (): void => writeRaw(attempt, (attempt.value as number) + 1);

  bind(() => readSignal(attempt), () => {
    const focused = clear();
    if (parent?.state) return;
    const o = new Owner(parent, 'catchError');
    o.boundary = onError;
    current = o;
    let frag: DocumentFragment;
    try {
      frag = runSetup(o, regionLabel(parent, 'catchError'), () => fragmentOf(tryFn()));
    } catch (e) {
      // Thrown synchronously by the try setup (B8.2): this boundary is on the stack.
      if (current === o) { dispose(o); current = undefined; }
      showFallback(e);
      r.changed();
      restoreFocus(focused);
      return;
    }
    r.insert(frag);
    r.changed();
    restoreFocus(focused);
  }, { name: 'catchError' });
  return r.fragment();
}

// ---------------------------------------------------------------- component, mount, css

export function component<A extends unknown[]>(fn: (...args: A) => Node): (...args: A) => Node {
  const name = fn.name || 'Anonymous';
  const wrapper = (...args: A): Node => {
    checkOwned(`component <${name}>`);
    const o = new Owner(currentOwner(), `<${name}>`);
    o.comp = `<${name}>`;
    const node = runSetup(o, `<${name}>`, () => fn(...args));
    if (DEV && !(node instanceof Node)) {
      throw new JasnoError('COMPONENT_RETURN_NOT_NODE', `Component <${name}> returned ${node === null ? 'null' : typeof node}, not a Node.`,
        'Return one element or a show/match/each region.', { ownerPath: ownerPath(o) });
    }
    return node;
  };
  Object.defineProperty(wrapper, 'name', { value: name });
  return wrapper;
}

const RUNTIME = Symbol.for('jasno.runtime');
(globalThis as Record<symbol, string>)[RUNTIME] ??= import.meta.url;

/** Mounted targets: the focus-loss check watches focus inside them (B20.1). */
const targets = new Set<Element>();

export function mount(view: () => Node, target: Element | null): () => void {
  if (target == null) {
    throw new JasnoError('MOUNT_TARGET_MISSING', 'mount() got a null target.',
      "Add <div id=\"app\"></div> to index.html and call mount(App, document.getElementById('app')).");
  }
  const first = (globalThis as Record<symbol, string>)[RUNTIME];
  if (first !== import.meta.url) {
    throw new JasnoError('DUPLICATE_RUNTIME', `Two copies of jasno are loaded: ${first} and ${import.meta.url}.`,
      "Import jasno only as '@jasno/core' and never write an import map: jasno dev and jasno dist generate it.");
  }
  assertNotDerivation('mount()');
  const root = new Owner(undefined, undefined);
  root.comp = '<mount>';
  let frag: DocumentFragment;
  try {
    frag = runSetup(root, '<mount>', () => fragmentOf(view()));
  } catch (e) {
    dispose(root);
    throw e;
  }
  const nodes = [...frag.childNodes];
  target.replaceChildren(frag);
  targets.add(target);
  schedule(); // the first flush (B16.3), also for a view with no effects: it runs the after-flush checks
  let done = false;
  return () => {
    if (done) return;
    done = true;
    dispose(root);
    targets.delete(target);
    const firstNode = nodes[0], lastNode = nodes[nodes.length - 1];
    if (!firstNode || firstNode.parentNode !== target) return;
    for (let n: Node | null = firstNode; n;) {
      const nx: Node | null = n === lastNode ? null : n.nextSibling;
      target.removeChild(n);
      n = nx;
    }
  };
}

const sheets = new WeakMap<TemplateStringsArray, CSSStyleSheet>();

export function css(strings: TemplateStringsArray): CSSStyleSheet {
  let sheet = sheets.get(strings);
  if (sheet) return sheet;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(strings.raw.join(''));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  sheets.set(strings, sheet);
  return sheet;
}

// ---------------------------------------------------------------- dev checks after each flush (B15.10, B20)

let focused: Element | null = null;
/** The element focused in a mounted root when the running flush started (B17.3 late outlets, B20.2). */
export const flushFocus = (): Element | null => focused;

function lostBy(el: Element): string {
  if (!el.isConnected) return 'removed';
  if ((el as HTMLButtonElement).disabled === true || el.matches(':disabled')) return 'disabled';
  if (el.matches('button, input, select, textarea')) {
    const fs = el.closest('fieldset[disabled]');
    const legend = fs?.querySelector(':scope > legend');
    if (fs && !legend?.contains(el)) return 'disabled';
  }
  if (el.closest('[inert]')) return 'made inert';
  if (el.closest('[hidden]')) return 'hid';
  const check = (el as HTMLElement).checkVisibility;
  if (typeof check === 'function' && !check.call(el)) return 'hid';
  return '';
}

hooks.flushStart = () => {
  const a = typeof document === 'object' ? document.activeElement : null;
  focused = a && a !== document.body && targets.values().some((t) => t.contains(a)) ? a : null;
};
/** Focus-loss checks queued for a microtask; mountTest's dispose() runs them first, so an update right before it counts. */
const focusChecks = new Set<() => void>();
export function runFocusChecks(): void { for (const c of [...focusChecks]) c(); }
if (DEV) {
  hooks.flushEnd = () => {
    checkNames();
    const el = focused;
    focused = null;
    if (!el) return;
    const cause = currentFlushCause();
    const check = (): void => {
      const a = document.activeElement;
      if (a !== el && a !== document.body && a !== null) return;
      if (focusHandled.has(el)) return;
      const action = lostBy(el);
      if (!action) return;
      warn('FOCUS_LOST', `Focus was on <${el.localName}> in ${pathOfNode(el)}, which this update ${action}; focus fell to <body>.`,
        focusHint.get(el) ?? "Keep the control enabled with 'aria-disabled', focus what replaced it in onMount, or focus something that stays before the change (a Retry inside show(): the status line).",
        { ownerPath: pathOfNode(el), node: cause, owner: elementOwner.get(el), key: `${el.localName}|${action}|${pathOfNode(el)}|${cause}` });
    };
    const run = (): void => {
      if (!focusChecks.delete(run)) return;
      const wait = hooks.focusPending?.(); // the router is about to move focus (a late outlet's first render)
      if (wait) void wait.then(check, check);
      else check();
    };
    focusChecks.add(run);
    queueMicrotask(run);
  };
}

// LEAK_IN_SETUP (B12.8): global listeners and timers created while a setup label is set.
if (DEV) {
  const leak = (api: string): void => {
    const region = strictLabel();
    if (!region) return;
    warn('LEAK_IN_SETUP', `${api} was called during setup of ${region}; it outlives the component.`,
      'Move it into onMount(({ abortSignal }) => ...) and pass { signal: abortSignal } or return a cleanup.',
      { ...here(), region, node: api });
  };
  const g = globalThis as unknown as Record<string, Function>;
  for (const name of ['setTimeout', 'setInterval']) {
    const orig = g[name];
    if (typeof orig !== 'function') continue;
    const wrapped = function (this: unknown, ...args: unknown[]) { leak(`${name}()`); return orig.apply(this, args); };
    Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(orig));
    g[name] = wrapped;
  }
  const owners = new Set<object>();
  const starts = [globalThis.EventTarget?.prototype, typeof document === 'object' ? document : undefined, globalThis,
    ...['BroadcastChannel', 'MessagePort', 'WebSocket', 'EventSource', 'AbortSignal'].map((n) => (g[n] as { prototype?: object } | undefined)?.prototype)];
  for (const start of starts) {
    let p: object | null | undefined = start;
    while (p && !Object.hasOwn(p, 'addEventListener')) p = Object.getPrototypeOf(p);
    if (p) owners.add(p);
  }
  let inside = false; // the platform's own nested calls (happy-dom subscribes to options.signal) are not the app's
  for (const p of owners) {
    const target = p as { addEventListener: Function };
    const orig = target.addEventListener;
    target.addEventListener = function (this: unknown, type: string, fn: unknown, opts?: unknown) {
      if (!inside && strictLabel() && !(typeof Element === 'function' && this instanceof Element)
        && !(typeof AbortSignal === 'function' && this instanceof AbortSignal)
        && !(opts && typeof opts === 'object' && (opts as { signal?: unknown }).signal)) {
        leak(`addEventListener('${type}')`);
      }
      const was = inside;
      inside = true;
      try { return orig.call(this, type, fn, opts); } finally { inside = was; }
    };
  }
}

function checkNames(): void {
  for (let i = unnamed.length; i--;) {
    const e = unnamed[i]!;
    if (!e.el.isConnected) { if (++e.tries > 2) unnamed.splice(i, 1); continue; }
    unnamed.splice(i, 1);
    if (!hasName(e.el)) {
      warn('INTERACTIVE_NO_NAME', `<${e.el.localName}> in ${pathOfNode(e.el)} has no accessible name.`,
        "Add text, aria-label or aria-labelledby, or wrap it: h.label(null, 'Name', h.input(...)).",
        { ownerPath: pathOfNode(e.el), owner: elementOwner.get(e.el) });
    }
  }
}

const ownName = (el: Element | null): boolean =>
  !!el && !!(el.textContent?.trim() || el.getAttribute('aria-label')?.trim() || el.getAttribute('alt')?.trim()
    || el.getAttribute('title')?.trim() || el.querySelector('img[alt]:not([alt=""])'));

function hasName(el: Element): boolean {
  if (el.getAttribute('aria-label')?.trim() || el.getAttribute('title')?.trim()) return true;
  const by = el.getAttribute('aria-labelledby');
  if (by && by.split(/\s+/).some((id) => ownName(document.getElementById(id)))) return true;
  const tag = el.localName;
  if (tag === 'input') {
    const input = el as HTMLInputElement;
    if (input.type === 'hidden' || input.type === 'submit' || input.type === 'reset') return true;
    if (input.type === 'button' && input.value.trim()) return true;
    if (input.type === 'image' && input.alt.trim()) return true;
  }
  if ((tag === 'button' || tag === 'a') && ownName(el)) return true;
  if (tag === 'a' && !el.hasAttribute('href')) return true; // not interactive
  const labels = (el as HTMLInputElement).labels;
  if (labels && [...labels].some((l) => l.textContent?.trim())) return true;
  const wrap = el.closest('label');
  return !!wrap?.textContent?.trim();
}

/** For __JASNO__.inspect(node). */
export function describeElement(n: Node): { name: string; ownerPath: string } {
  return { name: (n as Element).localName ?? n.nodeName, ownerPath: pathOfNode(n) };
}

// ---------------------------------------------------------------- two-way binding (B15.12)

/** `{ value, oninput }` for an input, textarea or select bound to a string (a select fires input too). Without set, read is a writable signal and its set is used. */
export function bindValue(read: () => string, set = (read as { set?: (value: string) => void }).set!): { value: () => string; oninput: (e: { currentTarget: { value: string } }) => void } {
  return { value: read, oninput: (e) => set(e.currentTarget.value) };
}

/**
 * `{ value, oninput }` for a type="number" input bound to a number: '' and NaN read as undefined, which shows as ''.
 * The text the field holds is kept while it still means the current value, so typing "1.50" is not rewritten to "1.5"
 * under the caret; once another value has been shown the text is forgotten. Without set, read is a writable signal.
 */
export function bindNumber(read: () => number | undefined, set = (read as { set?: (value: number | undefined) => void }).set!): { value: () => string; oninput: (e: { currentTarget: { value: string; valueAsNumber: number } }) => void } {
  let text: string | undefined; // what the field showed when set() last ran
  let shown: number | undefined;
  return {
    value: () => {
      const n = read();
      if (text !== undefined && n === shown) return text;
      text = undefined;
      return n === undefined ? '' : String(n);
    },
    oninput: (e) => {
      const el = e.currentTarget;
      const n = el.value === '' || Number.isNaN(el.valueAsNumber) ? undefined : el.valueAsNumber;
      text = el.value;
      shown = n;
      set(n);
    },
  };
}

/** `{ checked, onchange }` for a checkbox bound to a boolean. Without set, read is a writable signal and its set is used. */
export function bindChecked(read: () => boolean, set = (read as { set?: (checked: boolean) => void }).set!): { checked: () => boolean; onchange: (e: { currentTarget: { checked: boolean } }) => void } {
  return { checked: read, onchange: (e) => set(e.currentTarget.checked) };
}
