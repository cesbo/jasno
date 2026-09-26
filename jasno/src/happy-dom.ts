// jasno/testing/happy-dom: registers happy-dom's window as the global object (the same steps as
// @happy-dom/global-registrator, without the extra package).
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

// happy-dom 20.14.5 skips the dialog focusing steps: showModal() does not focus [autofocus] and close() does not
// return focus to the element that opened it. The RECIPES dialog patterns depend on both (FOCUS_LOST otherwise).
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
      close.call(this, returnValue);
      const opener = openers.get(this);
      openers.delete(this);
      if (wasOpen && inside && opener?.isConnected) (opener as HTMLElement).focus();
    },
  });
}
