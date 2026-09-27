// jasno/testing/happy-dom: registers happy-dom's window as the global object (the same steps as
// @happy-dom/global-registrator, without the extra package).
import { setTimeout as nodeSetTimeout } from 'node:timers';
import { GlobalWindow, PropertySymbol } from 'happy-dom';

const g = globalThis as Record<PropertyKey, unknown>;
if (!g.happyDOM) {
  const window = new GlobalWindow({ url: 'http://localhost/', console: globalThis.console });
  const skip = new Set(['constructor', 'undefined', 'NaN', 'global', 'globalThis']);
  const descriptors = Object.getOwnPropertyDescriptors(window) as Record<PropertyKey, PropertyDescriptor>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === 'string' && skip.has(key)) continue;
    const d = descriptors[key]!;
    const own = Object.getOwnPropertyDescriptor(globalThis, key);
    if (typeof key === 'string' && own?.value !== undefined && own.value === d.value) continue;
    if (d.value === window) { (window as unknown as Record<PropertyKey, unknown>)[key] = globalThis; d.value = globalThis; }
    Object.defineProperty(globalThis, key, { ...d, configurable: true });
  }
  (g.document as Record<PropertyKey, unknown>)[PropertySymbol.defaultView] = globalThis;
}

// happy-dom's AbortSignal.timeout() holds a referenced timer, so the recipes' AbortSignal.timeout(10_000) kept
// `npm test` alive for 10 s after the last test. Node's own unreferences its timer; this does the same.
(g.AbortSignal as typeof AbortSignal).timeout = (ms: number): AbortSignal => {
  const c = new (g.AbortController as typeof AbortController)();
  nodeSetTimeout(() => c.abort(new (g.DOMException as typeof DOMException)('signal timed out', 'TimeoutError')), ms).unref();
  return c.signal;
};

// happy-dom 20.14.5 skips the dialog focusing steps: showModal() does not focus [autofocus] and close() does not
// return focus to the element that opened it. The RECIPES dialog patterns depend on both (FOCUS_LOST otherwise).
// Its close() also fires 'close' before focus returns and resets returnValue; browsers return focus first (the close
// event is a queued task there, synchronous here), and close() without an argument keeps returnValue.
const dialog = (g.HTMLDialogElement as { prototype?: HTMLDialogElement } | undefined)?.prototype;
if (dialog && !(dialog as unknown as Record<string, unknown>).__jasnoFocus) {
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]';
  const openers = new WeakMap<HTMLDialogElement, Element | null>();
  const { showModal, close } = dialog;
  Object.assign(dialog, {
    __jasnoFocus: true,
    showModal(this: HTMLDialogElement) {
      const before = document.activeElement;
      showModal.call(this);
      openers.set(this, before);
      ((this.querySelector('[autofocus]') ?? this.querySelector(FOCUSABLE)) as HTMLElement | null)?.focus();
    },
    close(this: HTMLDialogElement, returnValue?: string) {
      const wasOpen = this.open;
      const inside = this.contains(document.activeElement);
      const kept = this.returnValue;
      const held: Event[] = [];
      const own = this as unknown as { dispatchEvent(e: Event): boolean };
      own.dispatchEvent = (e) => { held.push(e); return true; };
      try { close.call(this, returnValue); } finally { delete (own as Partial<typeof own>).dispatchEvent; }
      if (returnValue === undefined) this.returnValue = kept;
      const opener = openers.get(this);
      openers.delete(this);
      if (wasOpen && inside && opener?.isConnected) (opener as HTMLElement).focus();
      for (const e of held) this.dispatchEvent(e);
    },
  });
}
