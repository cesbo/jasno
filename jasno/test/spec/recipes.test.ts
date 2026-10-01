// Spec conformance: the RECIPES block of jasno.d.ts and the examples/claims of AGENTS.md (router excluded).
// Correct recipe code must produce zero diagnostics (ADR-24) and behave as the recipe says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catchError, component, computed, createContext, createRoot, css, each, effect, flush, h, linkedSignal, match, onMount,
  provide, resource, selector, show, signal, svg, untracked, useContext, type Read,
} from '@jasno/core';
import { mountTest, settled } from '@jasno/core/testing';
import { capture, deferred, tick } from '../helpers.ts';

const key = (k: string, init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
const press = (el: HTMLElement) => { el.focus(); el.click(); };
/** Identity assert that never inspects DOM nodes (happy-dom graphs hang assert's diff). */
const same = (a: unknown, b: unknown, msg = 'same node') => assert.ok(a === b, `${msg}: got <${(a as Element | null)?.localName ?? a}> ${(a as Element | null)?.textContent ?? ''}`);
const texts = (root: Element, sel = 'li') => [...root.querySelectorAll(sel)].map((n) => n.textContent);

/** Counts assignments to an instance property, forwarding to the prototype accessor. */
function spy(el: object, prop: string): { writes: unknown[] } {
  let proto = Object.getPrototypeOf(el);
  let d: PropertyDescriptor | undefined;
  while (proto && !(d = Object.getOwnPropertyDescriptor(proto, prop))) proto = Object.getPrototypeOf(proto);
  const log = { writes: [] as unknown[] };
  Object.defineProperty(el, prop, {
    configurable: true,
    get() { return d!.get!.call(el); },
    set(v) { log.writes.push(v); d!.set!.call(el, v); },
  });
  return log;
}

interface Card { readonly id: string; readonly title: string }

// ================================================================ Forms

const SignupForm = component(function SignupForm(p: { save: (email: string) => Promise<void> }): Node {
  const email = signal('');
  const emailOk = signal(false);
  const saving = signal(false);
  const save = async (): Promise<void> => {
    if (saving()) return;
    saving.set(true);
    try { await p.save(email()); } finally { saving.set(false); }
  };
  return h.form({ onsubmit: (e) => { e.preventDefault(); return save(); } },
    h.label(null, 'Email ', h.input({ type: 'email', required: true, value: email,
      oninput: (e) => { email.set(e.currentTarget.value); emailOk.set(e.currentTarget.validity.valid); } })),
    h.p({ role: 'status' }, () => (emailOk() ? 'ok' : 'invalid')),
    h.button({ type: 'submit', 'aria-disabled': saving }, 'Save'));
});

test('Forms: the recipe form submits once while saving, keeps the focused button enabled, settled() waits, zero diagnostics', async (t) => {
  const calls: string[] = [];
  const d = deferred<void>();
  const view = mountTest(t, () => SignupForm({ save: (e) => { calls.push(e); return d.promise; } }));
  const input = view.root.querySelector('input')!;
  const button = view.root.querySelector('button')!;
  input.value = 'nope';
  input.dispatchEvent(new Event('input'));
  input.form!.requestSubmit();
  flush();
  assert.deepEqual(calls, [], 'native constraints block onsubmit');
  assert.equal(view.root.querySelector('p')!.textContent, 'invalid');
  input.value = 'a@b.co';
  input.dispatchEvent(new Event('input'));
  press(button);
  flush();
  assert.deepEqual(calls, ['a@b.co']);
  assert.equal(button.getAttribute('aria-disabled'), 'true');
  press(button);
  flush();
  assert.deepEqual(calls, ['a@b.co'], 'guarded by if (saving()) return');
  same(document.activeElement, button, 'aria-disabled keeps focus');
  let done = false;
  const s = settled().then(() => { done = true; });
  await tick();
  assert.equal(done, false, 'settled() waits for the promise onsubmit returned');
  d.resolve();
  await s;
  assert.equal(button.getAttribute('aria-disabled'), 'false');
  assert.equal(view.root.querySelector('p')!.textContent, 'ok');
});

test('Forms: live value is assigned only when it differs (typing does not write the property back)', (t) => {
  const email = signal('');
  const view = mountTest(t, () => h.label(null, 'Email', h.input({ value: email, oninput: (e) => email.set(e.currentTarget.value) })));
  const input = view.root.querySelector('input')!;
  const log = spy(input, 'value');
  input.value = 'abc';
  log.writes.length = 0;
  input.setSelectionRange(1, 1);
  input.dispatchEvent(new Event('input'));
  flush();
  assert.deepEqual(log.writes, [], 'no write when the DOM already holds the value');
  assert.equal(input.selectionStart, 1);
  email.set('xyz');
  flush();
  assert.deepEqual(log.writes, ['xyz']);
});

test('Forms: radio group bound to one signal (checked: () => plan() === x, onchange: set)', (t) => {
  const plan = signal<'free' | 'pro'>('free');
  const radio = (v: 'free' | 'pro') => h.label(null, h.input({ type: 'radio', name: 'plan', checked: () => plan() === v, onchange: () => plan.set(v) }), v);
  const view = mountTest(t, () => h.fieldset(null, radio('free'), radio('pro')));
  const [free, pro] = [...view.root.querySelectorAll('input')] as HTMLInputElement[];
  assert.equal(free!.checked, true);
  pro!.click();
  flush();
  assert.equal(plan(), 'pro');
  assert.deepEqual([free!.checked, pro!.checked], [false, true]);
  plan.set('free');
  flush();
  assert.deepEqual([free!.checked, pro!.checked], [true, false]);
  free!.click(); // already checked: no change event, nothing breaks
  pro!.click();
  free!.click();
  flush();
  assert.equal(plan(), 'free');
  assert.deepEqual([free!.checked, pro!.checked], [true, false]);
});

test('Forms: numbers through e.currentTarget.valueAsNumber', (t) => {
  const n = signal(0);
  const view = mountTest(t, () => h.label(null, 'Qty', h.input({ type: 'number', min: '0', value: () => String(n()), oninput: (e) => n.set(e.currentTarget.valueAsNumber) })));
  const input = view.root.querySelector('input')!;
  input.value = '12';
  input.dispatchEvent(new Event('input'));
  flush();
  assert.equal(n(), 12);
  assert.equal(input.value, '12');
});

test('Forms: moving focus to the result in onMount after the form is removed reports nothing', async (t) => {
  const done = signal(false);
  const view = mountTest(t, () => h.div(null, show(done, () => {
    const msg = h.p({ tabIndex: -1 }, 'Saved');
    onMount(() => msg.focus());
    return msg;
  }, () => h.form({ onsubmit: (e) => { e.preventDefault(); done.set(true); } }, h.button({ type: 'submit' }, 'Save')))));
  press(view.root.querySelector('button')!);
  flush();
  await tick();
  same(document.activeElement, view.root.querySelector('p'));
});

test('Forms claim: disabling the focused submit button reports FOCUS_LOST', async (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const saving = signal(false);
  const target = document.createElement('div');
  document.body.append(target);
  const { mount } = await import('@jasno/core');
  const unmount = mount(() => h.button({ type: 'button', disabled: saving, onclick: () => saving.set(true) }, 'Save'), target);
  flush();
  press(target.querySelector('button')!);
  flush();
  await tick();
  unmount();
  target.remove();
  assert.ok(cap.codes().includes('FOCUS_LOST'), cap.codes().join());
});

// Drafts: a form per record inside match() on the record id.
const RecordForm = component(function RecordForm(p: { id: string; record: Read<Card>; save: (id: string, title: string) => Promise<void> }): Node {
  const draft = signal(untracked(p.record).title);
  const saving = signal(false);
  const submit = async (): Promise<void> => {
    if (saving()) return;
    const sent = draft();
    saving.set(true);
    try {
      await p.save(p.id, sent);
      if (draft() === sent) draft.set('');
    } finally { saving.set(false); }
  };
  return h.form({ onsubmit: (e) => { e.preventDefault(); return submit(); } },
    h.label(null, 'Title', h.input({ value: draft, oninput: (e) => draft.set(e.currentTarget.value) })),
    h.button({ type: 'submit', 'aria-disabled': saving }, 'Save'));
});

test('Forms/Drafts: a per-record form survives a save echo (new object, same id) and keeps text typed during the save', async (t) => {
  const record = signal<Card>({ id: 'r1', title: 'One' });
  let d = deferred<void>();
  const view = mountTest(t, () => h.div(null, match(() => record().id, (id) => RecordForm({ id, record, save: () => d.promise }))));
  const input = view.root.querySelector('input')!;
  assert.equal(input.value, 'One');
  input.value = 'X';
  input.dispatchEvent(new Event('input'));
  view.root.querySelector('form')!.requestSubmit();
  input.value = 'XY';
  input.dispatchEvent(new Event('input'));
  record.set({ id: 'r1', title: 'X' }); // echo
  d.resolve();
  await settled();
  same(view.root.querySelector('input'), input, 'same form element');
  assert.equal(input.value, 'XY', 'draft typed during the save is kept');
  d = deferred<void>();
  view.root.querySelector('form')!.requestSubmit();
  d.resolve();
  await settled();
  assert.equal(input.value, '', 'draft cleared when it still holds the sent text');
  record.set({ id: 'r2', title: 'Two' });
  flush();
  const next = view.root.querySelector('input')!;
  assert.ok(next !== input, 'a new form for the new record');
  assert.equal(next.value, 'Two');
});

test('Forms/Drafts: a short-lived editor seeds with untracked(p.card).title silently', (t) => {
  const card = signal<Card>({ id: 'a', title: 'Seed' });
  const Editor = component(function Editor(p: { card: Read<Card> }): Node {
    return h.label(null, 'Title', h.input({ value: untracked(p.card).title }));
  });
  const view = mountTest(t, () => Editor({ card }));
  card.set({ id: 'a', title: 'Changed' });
  flush();
  assert.equal(view.root.querySelector('input')!.value, 'Seed');
});

// ================================================================ Inline edit

const InlineRow = component(function InlineRow(p: { card: Read<Card>; onRename: (title: string) => Promise<void> }): Node {
  const editing = signal(false);
  let refocus = false;
  return h.li(null, show(editing, () => {
    const commit = (again: boolean) => {
      refocus = again; editing.set(false);
      const title = input.value.trim(); if (title && title !== p.card().title) return p.onRename(title);
    };
    const input = h.input({ value: untracked(p.card).title, 'aria-label': 'Title',
      onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); refocus = true; editing.set(false); } },
      onblur: () => { if (editing()) commit(false); } });
    onMount(() => { input.focus(); input.select(); });
    return h.form({ onsubmit: (e) => { e.preventDefault(); return commit(true); } }, input);
  }, () => {
    const title = h.button({ type: 'button', onclick: () => editing.set(true) }, () => p.card().title);
    if (refocus) { refocus = false; onMount(() => title.focus()); }
    return title;
  }));
});

function inlineList(t: Parameters<typeof mountTest>[0]) {
  const cards = signal<readonly Card[]>([{ id: 'a', title: 'Old' }]);
  const renames: string[] = [];
  const onRename = async (title: string): Promise<void> => {
    renames.push(title);
    await tick();
    cards.update((a) => a.map((c) => (c.id === 'a' ? { ...c, title } : c)));
  };
  const view = mountTest(t, () => h.div(null,
    h.ul(null, each(cards, { key: (c) => c.id, render: (card) => InlineRow({ card, onRename }) })),
    h.button({ type: 'button' }, 'Other')));
  const titleBtn = () => view.root.querySelector('li button') as HTMLButtonElement | null;
  const input = () => view.root.querySelector('li input') as HTMLInputElement | null;
  const other = [...view.root.querySelectorAll('button')].at(-1)!;
  return { view, cards, renames, titleBtn, input, other };
}

test('Inline edit: Enter (form submit) saves, focus returns to the new title button, row kept, zero diagnostics', async (t) => {
  const { view, renames, titleBtn, input } = inlineList(t);
  press(titleBtn()!);
  flush();
  same(document.activeElement, input(), 'input focused in onMount');
  assert.equal(input()!.value, 'Old');
  input()!.value = 'New';
  input()!.dispatchEvent(key('Enter'));
  await Promise.resolve(); // a browser runs microtasks after the keydown listener, before implicit submission
  input()!.form!.requestSubmit(); // implicit submission
  flush();
  const title = titleBtn()!;
  same(document.activeElement, title);
  await settled();
  assert.deepEqual(renames, ['New']);
  assert.equal(title.textContent, 'New');
  same(titleBtn(), title, 'the echo updates the row in place');
  assert.equal(view.root.querySelectorAll('li').length, 1);
});

test('Inline edit: Escape cancels and refocuses the title; no rename', async (t) => {
  const { renames, titleBtn, input } = inlineList(t);
  press(titleBtn()!);
  flush();
  input()!.value = 'Changed';
  input()!.dispatchEvent(key('Escape'));
  flush();
  await settled();
  assert.deepEqual(renames, []);
  same(document.activeElement, titleBtn());
  assert.equal(titleBtn()!.textContent, 'Old');
});

test('Inline edit: leaving the field saves without pulling focus back', async (t) => {
  const { renames, titleBtn, input, other } = inlineList(t);
  press(titleBtn()!);
  flush();
  input()!.value = 'Blurred';
  other.focus(); // tab away: blur on the input
  flush();
  await settled();
  assert.deepEqual(renames, ['Blurred']);
  same(document.activeElement, other);
  assert.equal(titleBtn()!.textContent, 'Blurred');
});

test('Inline edit: submitting an unchanged title does not rename', async (t) => {
  const { renames, titleBtn, input } = inlineList(t);
  press(titleBtn()!);
  flush();
  input()!.form!.requestSubmit();
  flush();
  await settled();
  assert.deepEqual(renames, []);
  same(document.activeElement, titleBtn());
});

// ================================================================ Mutations

test('Mutations: add() reloads only when params are unchanged after the await', async (t) => {
  const params = signal({ id: 'n1' });
  const loads: string[] = [];
  let pending = deferred<void>();
  const Notes = component(function Notes(p: { params: Read<{ id: string }> }): Node {
    const notes = resource({ params: () => p.params().id, loader: async ({ params: id }) => { loads.push(id); return [`${id}:${loads.length}`]; } });
    async function add(text: string): Promise<void> {
      const id = p.params().id;
      await pending.promise.then(() => text);
      if (p.params().id === id) notes.reload();
    }
    return h.div(null, h.button({ type: 'button', onclick: () => add('x') }, 'Add'),
      h.ul(null, each(() => (notes.hasValue() ? notes.value() : []), { key: (n) => n, render: (n) => h.li(null, n) })));
  });
  const view = mountTest(t, () => Notes({ params }));
  await settled();
  assert.deepEqual(loads, ['n1']);
  press(view.root.querySelector('button')!);
  pending.resolve();
  await settled();
  assert.deepEqual(loads, ['n1', 'n1'], 'reload() refetches the current params');
  pending = deferred<void>();
  press(view.root.querySelector('button')!);
  params.set({ id: 'n2' });
  await tick();
  pending.resolve();
  await settled();
  assert.deepEqual(loads, ['n1', 'n1', 'n2'], 'no reload after the params changed');
  assert.deepEqual(texts(view.root), ['n2:3']);
});

// Optimistic save queue: exactly the recipe, with a module-level resource in createRoot.
let serverCards: Card[] = [{ id: 'c1', title: 'Server' }];
let listImpl: () => Promise<readonly Card[]> = async () => serverCards.map((c) => ({ ...c }));
const saves: { id: string; title: string; d: ReturnType<typeof deferred<void>> }[] = [];
const saveTitle = (id: string, title: string, _s: AbortSignal): Promise<void> => {
  const d = deferred<void>();
  saves.push({ id, title, d });
  return d.promise;
};
const toastLog: string[] = [];
const toast = (m: string) => { toastLog.push(m); };
const cards = createRoot(() => resource({ loader: () => listImpl(), debugName: 'cards' }));
const confirmed = new Map<string, string>();
const queue = new Map<string, Promise<void>>();
function rename(id: string, title: string): Promise<void> {
  if (!cards.hasValue()) return Promise.resolve();
  const show = (to: string) => { if (cards.hasValue())
    cards.set(cards.value().map((c) => (c.id === id ? { ...c, title: to } : c))); };
  if (!confirmed.has(id)) confirmed.set(id, cards.value().find((c) => c.id === id)?.title ?? title);
  show(title);
  const run: Promise<void> = (queue.get(id) ?? Promise.resolve()).then(async () => {
    const last = () => queue.get(id) === run;
    try { await saveTitle(id, title, AbortSignal.timeout(10_000)); confirmed.set(id, title); if (last()) show(title); }
    catch { if (last()) { show(confirmed.get(id) ?? title); toast('Not saved; your change was undone'); } }
    finally { if (last()) { queue.delete(id); confirmed.delete(id); } }
  });
  queue.set(id, run);
  return run;
}

async function cardList(t: import('node:test').TestContext) {
  t.mock.method(AbortSignal, 'timeout', () => new AbortController().signal); // no real 10 s timer keeping node alive
  serverCards = [{ id: 'c1', title: 'Server' }];
  listImpl = async () => serverCards.map((c) => ({ ...c }));
  saves.length = 0;
  toastLog.length = 0;
  const view = mountTest(t, () => h.ul(null, each(() => (cards.hasValue() ? cards.value() : []), {
    key: (c) => c.id, render: (c) => h.li(null, () => c().title) })));
  cards.reload();
  await settled();
  const title = () => view.root.querySelector('li')?.textContent;
  assert.equal(title(), 'Server');
  const until = async (n: number) => { while (saves.length < n) await tick(); };
  return { view, title, until };
}

test('Mutations: a failed single save shows the confirmed value again and toasts', async (t) => {
  const { title, until } = await cardList(t);
  const p1 = rename('c1', 'A');
  flush();
  assert.equal(title(), 'A');
  await until(1);
  saves[0]!.d.reject(new Error('500'));
  await p1;
  flush();
  assert.equal(title(), 'Server');
  assert.deepEqual(toastLog, ['Not saved; your change was undone']);
  assert.equal(queue.size, 0);
  assert.equal(confirmed.size, 0);
});

test('Mutations: last queued save fails after an earlier one succeeded: shows the earlier accepted value', async (t) => {
  const { title, until } = await cardList(t);
  const pa = rename('c1', 'A');
  const pb = rename('c1', 'B');
  flush();
  assert.equal(title(), 'B');
  await until(1);
  assert.equal(saves.length, 1, 'saves of one record run one after another');
  saves[0]!.d.resolve();
  await pa;
  flush();
  assert.equal(title(), 'B', 'an earlier success does not overwrite the newer optimistic value');
  await until(2);
  saves[1]!.d.reject(new Error('500'));
  await pb;
  flush();
  assert.equal(title(), 'A');
  assert.equal(toastLog.length, 1);
});

test('Mutations: an earlier failure changes nothing while a newer value is being saved; the last success shows it', async (t) => {
  const { title, until } = await cardList(t);
  const pa = rename('c1', 'A');
  const pb = rename('c1', 'B');
  await until(1);
  saves[0]!.d.reject(new Error('500'));
  await pa;
  flush();
  assert.equal(title(), 'B');
  assert.deepEqual(toastLog, []);
  await until(2);
  saves[1]!.d.resolve();
  await pb;
  flush();
  assert.equal(title(), 'B');
});

test('Mutations: a successful last save shows its value again after a reload() replaced it', async (t) => {
  const { title, until } = await cardList(t);
  const pa = rename('c1', 'A');
  await until(1);
  cards.reload(); // polling or Retry: the server still says 'Server'
  await settled().catch(() => {}); // the save is pending (not tracked); loaders settle
  await tick();
  flush();
  assert.equal(title(), 'Server');
  saves[0]!.d.resolve();
  await pa;
  flush();
  assert.equal(title(), 'A');
  assert.equal(cards.status(), 'local');
});

test('Mutations claim: a failed reload() clears the value (never reload() after an optimistic save)', async (t) => {
  const { title } = await cardList(t);
  rename('c1', 'A').catch(() => {});
  listImpl = async () => { throw new Error('offline'); };
  cards.reload();
  await settled();
  assert.equal(cards.status(), 'error');
  assert.equal(cards.hasValue(), false);
  assert.equal(title(), undefined);
  saves[0]?.d.resolve();
  await tick();
  listImpl = async () => serverCards.map((c) => ({ ...c }));
  cards.reload();
  await settled();
});

test('Mutations: a client id (crypto.randomUUID) keeps the row through the server echo', async (t) => {
  const items = signal<readonly Card[]>([]);
  const view = mountTest(t, () => h.ul(null, each(items, { key: (c) => c.id, render: (c) => h.li(null, () => c().title) })));
  const id = crypto.randomUUID();
  items.update((a) => [...a, { id, title: 'draft' }]);
  flush();
  const li = view.root.querySelector('li');
  const echo = JSON.parse(JSON.stringify({ id, title: 'saved' })) as Card;
  items.update((a) => a.map((c) => (c.id === echo.id ? echo : c)));
  flush();
  same(view.root.querySelector('li'), li);
  assert.equal(li!.textContent, 'saved');
});

// ================================================================ Modal dialog, menus, toasts

/** Emulates the browser's dialog focusing steps that happy-dom 20.14.5 lacks: close() refocuses the element focused at showModal(). */
function emulateDialogFocus(t: import('node:test').TestContext): void {
  const proto = HTMLDialogElement.prototype;
  const prev = new WeakMap<HTMLDialogElement, Element | null>();
  const showModal = proto.showModal, close = proto.close;
  t.mock.method(proto, 'showModal', function (this: HTMLDialogElement) { prev.set(this, document.activeElement); return showModal.call(this); });
  t.mock.method(proto, 'close', function (this: HTMLDialogElement, rv?: string) {
    const was = this.open;
    const r = close.call(this, rv);
    if (was) (prev.get(this) as HTMLElement | null | undefined)?.focus();
    return r;
  });
}

function deleteDialog(autofocus: boolean) {
  const removed: string[] = [];
  const d = deferred<void>();
  const Contact = component(function Contact(): Node {
    const remove = async (): Promise<void> => { await d.promise; removed.push('c1'); };
    const dialog = h.dialog({ 'aria-labelledby': 'del-title',
      onclose: (e) => { if (e.currentTarget.returnValue === 'yes') return remove(); } },
      h.form({ method: 'dialog' }, h.h2({ id: 'del-title' }, 'Delete this contact?'),
        h.button(autofocus ? { value: 'no', autofocus: true } : { value: 'no' }, 'Cancel'), h.button({ value: 'yes' }, 'Delete')));
    return h.div(null, h.button({ type: 'button', onclick: () => { dialog.returnValue = ''; dialog.showModal(); } }, 'Delete'), dialog);
  });
  return { Contact, removed, d };
}

test('Modal dialog recipe verbatim (autofocus: true on Cancel): zero diagnostics, autofocus reaches the DOM', (t) => {
  const { Contact } = deleteDialog(true);
  const cap = capture();
  t.after(() => cap.stop());
  const view = mountTest(t, () => Contact());
  const hasAutofocus = view.root.querySelector('button[value=no]')!.hasAttribute('autofocus');
  view.dispose();
  cap.stop();
  assert.deepEqual(cap.codes(), [], 'correct recipe code must produce zero diagnostics (ADR-24, B15.8)');
  assert.equal(hasAutofocus, true, 'autofocus reaches the DOM');
});

test('Modal dialog: showModal from a button, form method=dialog, onclose reads returnValue and returns remove() (autofocus omitted)', async (t) => {
  const { Contact, removed, d } = deleteDialog(false);
  const view = mountTest(t, () => Contact());
  const [open, no, yes] = [...view.root.querySelectorAll('button')] as HTMLButtonElement[];
  const dialog = view.root.querySelector('dialog')!;
  press(open!);
  assert.equal(dialog.open, true);
  press(no!);
  assert.equal(dialog.open, false);
  await settled();
  assert.deepEqual(removed, []);
  press(open!);
  press(yes!);
  assert.equal(dialog.open, false);
  let done = false;
  const s = settled().then(() => { done = true; });
  await tick();
  assert.equal(done, false, 'settled() waits for remove() returned by onclose');
  d.resolve();
  await s;
  assert.deepEqual(removed, ['c1']);
});

test('Modal dialog: reopened after a confirmed delete, Escape (close() with no value) does not delete again (pilot contacts G2)', async (t) => {
  const { Contact, removed, d } = deleteDialog(false);
  d.resolve();
  const view = mountTest(t, () => Contact());
  const [open, , yes] = [...view.root.querySelectorAll('button')] as HTMLButtonElement[];
  const dialog = view.root.querySelector('dialog')!;
  press(open!);
  press(yes!);
  await settled();
  press(open!);
  dialog.close(); // Escape: Firefox and WebKit keep the last returnValue ('yes'), so the recipe resets it on open
  await settled();
  assert.deepEqual(removed, ['c1']);
});

function branchDialog(t: import('node:test').TestContext) {
  const open = signal(false);
  const closes: string[] = [];
  const view = mountTest(t, () => h.div(null,
    h.button({ type: 'button', onclick: () => open.set(true) }, 'Open'),
    show(open, () => {
      const d = h.dialog({ 'aria-label': 'Card', onclose: () => { closes.push(d.returnValue); if (open()) open.set(false); } },
        h.form({ method: 'dialog' }, h.button(null, 'Close')));
      onMount(() => { d.showModal(); return () => d.close(); });
      return d;
    })));
  return { open, closes, view, opener: view.root.querySelector('button')! };
}

test('Modal dialog: a dialog in a branch opens itself in onMount and closes itself in the cleanup (browser focus steps emulated)', async (t) => {
  emulateDialogFocus(t);
  const { open, closes, view, opener } = branchDialog(t);
  press(opener);
  flush();
  const dialog = view.root.querySelector('dialog')!;
  assert.equal(dialog.open, true, 'open before the flush ends');
  press(dialog.querySelector('button')!); // closes through the form
  flush();
  await tick();
  same(view.root.querySelector('dialog'), null, 'onclose flipped the branch');
  assert.equal(closes.length, 1);
  same(document.activeElement, opener);
  press(opener);
  flush();
  view.root.querySelector('dialog')!.querySelector('button')!.focus();
  open.set(false); // removed from outside (Back, a parent): the cleanup closes it
  flush();
  await tick();
  same(view.root.querySelector('dialog'), null);
  assert.equal(closes.length, 2);
  same(document.activeElement, opener);
});

test('dialog-in-a-branch recipe returns focus to the opener under @jasno/core/testing/happy-dom (no FOCUS_LOST)', async (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const { view, opener } = branchDialog(t);
  press(opener);
  flush();
  press(view.root.querySelector('dialog')!.querySelector('button')!);
  flush();
  await tick();
  cap.stop();
  assert.deepEqual(cap.codes(), [], 'the recipe says close() returns focus to the opener');
});

test('Menus and tooltips: popover auto + popoverTargetElement are known props (no UNKNOWN_PROP)', (t) => {
  const view = mountTest(t, () => {
    const menu = h.div({ popover: 'auto', id: 'menu' }, h.button({ type: 'button' }, 'Rename'));
    return h.div(null, h.button({ type: 'button', popoverTargetElement: menu }, 'Menu'), menu);
  });
  const [btn] = [...view.root.querySelectorAll('button')] as HTMLButtonElement[];
  same((btn as unknown as { popoverTargetElement: Element }).popoverTargetElement, view.root.querySelector('#menu'));
});

interface ToastMsg { readonly id: number; readonly text: string }
const toasts = signal<readonly ToastMsg[]>([]);
const dismissed: number[] = [];
const dismiss = (id: number) => { dismissed.push(id); toasts.update((a) => a.filter((x) => x.id !== id)); };
const ToastRegion = component(function ToastRegion(): Node {
  const region: HTMLUListElement = h.ul({ 'aria-live': 'polite', tabIndex: -1 }, each(toasts, { key: (x) => x.id,
    render: (x, _i, id) => {
      const close = () => { if (row.contains(document.activeElement))
        ((row.nextElementSibling ?? row.previousElementSibling)?.querySelector('button') ?? region).focus(); dismiss(id); };
      onMount(() => { const timer = setTimeout(close, 5000); return () => clearTimeout(timer); });
      const row = h.li(null, () => x().text, h.button({ onclick: close, 'aria-label': 'Dismiss' }, 'x'));
      return row; } }));
  return region;
});

test('Toasts: rows own their timers, a closing focused row hands focus to a neighbour, then to the region; no FOCUS_LOST', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  dismissed.length = 0;
  const view = mountTest(t, () => ToastRegion());
  const region = view.root.querySelector('ul')!;
  for (const id of [1, 2, 3]) {
    toasts.update((a) => [...a, { id, text: `t${id}` }]);
    flush();
    t.mock.timers.tick(1000);
  }
  const btn = (id: number) => [...region.querySelectorAll('li')].find((li) => li.textContent === `t${id}x`)!.querySelector('button')!;
  press(btn(1)); // t=3000: dismiss by hand
  flush();
  same(document.activeElement, btn(2));
  assert.deepEqual(texts(region), ['t2x', 't3x']);
  t.mock.timers.tick(2000); // t=5000: t1's timer was cleared with its row
  flush();
  assert.deepEqual(dismissed, [1]);
  t.mock.timers.tick(1000); // t=6000: t2 expires while focused
  flush();
  await tick();
  same(document.activeElement, btn(3));
  t.mock.timers.tick(1000); // t=7000: t3 expires while focused, no neighbour
  flush();
  await tick();
  same(document.activeElement, region);
  assert.deepEqual(dismissed, [1, 2, 3]);
  assert.deepEqual(texts(region), []);
});

test('Toasts: module-level signals are reset after each test (AGENTS.md Testing)', () => {
  assert.deepEqual(toasts(), []);
});

// ================================================================ Focus

test('Focus: a row that moves to another list focuses its new copy in onMount (same flush, no FOCUS_LOST)', async (t) => {
  interface Task { readonly id: number; readonly text: string }
  const open = signal<readonly Task[]>([{ id: 1, text: 'a' }, { id: 2, text: 'b' }]);
  const done = signal<readonly Task[]>([]);
  let focusId: number | undefined;
  const Item = component(function Item(p: { task: Read<Task>; focus: boolean; onMove: () => void }): Node {
    const b = h.button({ type: 'button', onclick: p.onMove, 'aria-label': () => `Move ${p.task().text}` }, () => p.task().text);
    if (p.focus) onMount(() => b.focus());
    return h.li(null, b);
  });
  const move = (from: typeof open, to: typeof open, id: number) => {
    const task = from().find((x) => x.id === id)!;
    focusId = id;
    from.update((a) => a.filter((x) => x.id !== id));
    to.update((a) => [...a, task]);
  };
  const list = (src: typeof open, dst: typeof open, label: string) => h.ul({ 'aria-label': label }, each(src, { key: (x) => x.id,
    render: (task, _i, id) => Item({ task, focus: id === focusId, onMove: () => move(src, dst, id) }) }));
  const view = mountTest(t, () => h.div(null, list(open, done, 'Open'), list(done, open, 'Done')));
  press(view.root.querySelector('button')!);
  flush();
  await tick();
  const moved = view.root.querySelectorAll('ul')[1]!.querySelector('button')!;
  same(document.activeElement, moved);
  press(moved); // and back again, to the other list (created before it)
  flush();
  await tick();
  assert.equal(document.activeElement?.textContent, 'a');
  assert.equal(document.activeElement?.closest('ul')?.getAttribute('aria-label'), 'Open');
});

test('Focus: a row that vanishes (filter, delete) first focuses something that stays, in the handler', async (t) => {
  const items = signal<readonly string[]>(['a', 'b']);
  let heading!: HTMLElement;
  const view = mountTest(t, () => {
    heading = h.h2({ tabIndex: -1 }, 'Items');
    return h.div(null, heading, h.ul(null, each(items, { key: (x) => x, render: (_x, _i, k) =>
      h.li(null, h.button({ type: 'button', 'aria-label': `Delete ${k}`, onclick: () => { heading.focus(); items.update((a) => a.filter((y) => y !== k)); } }, 'x')) })));
  });
  press(view.root.querySelector('button')!);
  flush();
  await tick();
  same(document.activeElement, heading);
});

test('Focus claim: deleting the focused row without moving focus first reports FOCUS_LOST', async (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const items = signal<readonly string[]>(['a']);
  const view = mountTest(t, () => h.ul(null, each(items, { key: (x) => x, render: (_x, _i, k) =>
    h.li(null, h.button({ type: 'button', onclick: () => items.set([]) }, `Delete ${k}`)) })));
  press(view.root.querySelector('button')!);
  flush();
  await tick();
  assert.ok(cap.codes().includes('FOCUS_LOST'), cap.codes().join());
});

function keyView(t: Parameters<typeof mountTest>[0], prevent: boolean) {
  const editing = signal(false);
  return mountTest(t, () => h.div(null, show(editing, () => {
    const b = h.button({ type: 'button' }, 'Done');
    onMount(() => b.focus());
    return b;
  }, () => h.input({ 'aria-label': 'Name', onkeydown: (e) => { if (e.key === 'Enter') { if (prevent) e.preventDefault(); editing.set(true); } } }))));
}

test('Focus: an Enter keydown handler whose branch moves focus and calls preventDefault() reports nothing', async (t) => {
  const view = keyView(t, true);
  const input = view.root.querySelector('input')!;
  input.focus();
  input.dispatchEvent(key('Enter'));
  await tick();
  same(document.activeElement, view.root.querySelector('button'));
});

test('Focus claim: the same handler without preventDefault() reports KEY_ACTIVATES_NEW_FOCUS', async (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const view = keyView(t, false);
  const input = view.root.querySelector('input')!;
  input.focus();
  input.dispatchEvent(key('Enter'));
  await tick();
  assert.deepEqual(cap.codes(), ['KEY_ACTIVATES_NEW_FOCUS']);
});

function retryView(t: Parameters<typeof mountTest>[0], focusStatus: boolean) {
  let fail = true;
  const view = mountTest(t, () => {
    const r = resource({ loader: async () => { if (fail) throw new Error('down'); return 'data'; } });
    const status = h.p({ role: 'status', tabIndex: -1 }, () => (r.status() === 'error' ? 'Failed' : r.isLoading() ? 'Loading' : ''));
    return h.div(null, status,
      show(() => r.status() === 'error', () => h.button({ type: 'button', onclick: () => { if (focusStatus) status.focus(); fail = false; r.reload(); } }, 'Retry')),
      show(() => r.hasValue() && r.value(), (v) => h.p(null, v)));
  });
  return view;
}

test('Focus: Retry inside show(error) focuses the status line first, then reload(); no FOCUS_LOST', async (t) => {
  const view = retryView(t, true);
  await settled();
  press(view.root.querySelector('button')!);
  flush();
  await settled();
  same(document.activeElement, view.root.querySelector('[role=status]'));
  assert.equal(view.root.querySelectorAll('p')[1]!.textContent, 'data');
});

test('Focus claim: a Retry that does not move focus first reports FOCUS_LOST', async (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const view = retryView(t, false);
  await tick();
  flush();
  press(view.root.querySelector('button')!);
  flush();
  await tick();
  assert.ok(cap.codes().includes('FOCUS_LOST'), cap.codes().join());
});

// ================================================================ Polling, debounce, keep-last-value

test('Polling: reload 5 s after the last load settled, paused while hidden, zero diagnostics', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let hidden = false;
  t.mock.getter(document, 'hidden', () => hidden);
  const Metrics = component(function Metrics(): Node {
    const metrics = resource({ loader: async () => [++calls], debugName: 'metrics' });
    const visible = signal(!document.hidden);
    onMount(({ abortSignal }) => document.addEventListener('visibilitychange',
      () => visible.set(!document.hidden), { signal: abortSignal }));
    effect(() => { if (!visible() || metrics.isLoading()) return;
      const timer = setTimeout(() => metrics.reload(), 5000); return () => clearTimeout(timer); });
    return h.p(null, () => (metrics.hasValue() ? metrics.value().join(',') : 'Loading'));
  });
  const view = mountTest(t, () => Metrics());
  await settled();
  assert.equal(calls, 1);
  t.mock.timers.tick(4999);
  await settled();
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await settled();
  assert.equal(calls, 2);
  assert.equal(view.root.textContent, '2');
  hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  await settled();
  t.mock.timers.tick(20000);
  await settled();
  assert.equal(calls, 2, 'no polling while hidden');
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  await settled();
  t.mock.timers.tick(5000);
  await settled();
  assert.equal(calls, 3);
});

test('Debounce: an abortable delay in the loader; superseded delays never become errors', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const searches: string[] = [];
  const statuses: string[] = [];
  const delay = (ms: number, s: AbortSignal) => new Promise<void>((ok, fail) => {
    const timer = setTimeout(ok, ms); s.addEventListener('abort', () => { clearTimeout(timer); fail(s.reason); }); });
  const query = signal('');
  const Search = component(function Search(): Node {
    const results = resource({
      params: () => query() || undefined,
      loader: async ({ params, abortSignal }) => { await delay(300, abortSignal); searches.push(params); return [params]; },
    });
    effect(() => { statuses.push(results.status()); });
    return h.div(null, h.input({ 'aria-label': 'Search', value: query, oninput: (e) => query.set(e.currentTarget.value) }),
      h.ul(null, each(() => (results.hasValue() ? results.value() : []), { key: (r) => r, render: (r) => h.li(null, r) })));
  });
  const view = mountTest(t, () => Search());
  const input = view.root.querySelector('input')!;
  for (const v of ['a', 'ab', 'abc']) {
    input.value = v;
    input.dispatchEvent(new Event('input'));
    flush();
    t.mock.timers.tick(100);
    await tick();
  }
  t.mock.timers.tick(300);
  await settled();
  assert.deepEqual(searches, ['abc']);
  assert.deepEqual(texts(view.root), ['abc']);
  assert.ok(!statuses.includes('error'), statuses.join());
});

test('Keep the last good value across errors: latest() with the error beside it (value() throws after a failed reload)', async (t) => {
  let fail = false;
  let n = 0;
  let metrics!: ReturnType<typeof resource<readonly number[]>>;
  const view = mountTest(t, () => {
    metrics = resource({ loader: async (): Promise<readonly number[]> => { if (fail) throw new Error('down'); n++; return [n, n + 10]; } });
    return h.div(null,
      h.p({ role: 'alert' }, () => (metrics.status() === 'error' ? 'Could not refresh.' : '')),
      show(() => metrics.latest(), (m) => h.p(null, () => m().join(', ')), () => h.p(null, 'Loading')));
  });
  const text = () => [...view.root.querySelectorAll('p')].map((p) => p.textContent);
  assert.deepEqual(text(), ['', 'Loading']);
  await settled();
  assert.deepEqual(text(), ['', '1, 11']);
  fail = true;
  metrics.reload();
  await settled();
  assert.equal(metrics.status(), 'error');
  assert.throws(() => metrics.value());
  assert.deepEqual(text(), ['Could not refresh.', '1, 11'], 'last good value kept, error beside it');
  metrics.reload();
  await settled();
  assert.deepEqual(text(), ['Could not refresh.', '1, 11']);
  fail = false;
  metrics.reload();
  await settled();
  assert.deepEqual(text(), ['', '2, 12']);
});

test('React to a failed load inside the loader (try/catch, notify, rethrow): zero diagnostics', async (t) => {
  const message = signal('');
  const view = mountTest(t, () => {
    const r = resource({ loader: async (): Promise<string> => {
      try { await Promise.resolve(); throw new Error('down'); } catch (e) { message.set('Could not load'); throw e; }
    } });
    return h.div(null, h.p({ role: 'status' }, () => message()), show(() => r.status() === 'error', () => h.p(null, 'error view')));
  });
  await settled();
  assert.equal(view.root.textContent, 'Could not loaderror view');
});

// ================================================================ State and lifetime

test('State and lifetime: a view publishes to the shell in onMount and resets it in the cleanup', async (t) => {
  const shellTitle = signal('');
  const page = signal<'a' | 'b' | null>('a');
  const View = component(function View(p: { name: string }): Node {
    onMount(() => { shellTitle.set(p.name); return () => shellTitle.set(''); });
    return h.h1(null, p.name);
  });
  const view = mountTest(t, () => h.div(null, h.header(null, () => shellTitle()), h.main(null, match(page, (k) => (k === null ? '' : View({ name: k }))))));
  assert.equal(view.root.querySelector('header')!.textContent, 'a');
  page.set('b');
  flush();
  assert.equal(view.root.querySelector('header')!.textContent, 'b', 'old cleanup ran before the new onMount');
  page.set(null);
  flush();
  assert.equal(view.root.querySelector('header')!.textContent, '');
});

test('State and lifetime: writes after a component is gone are harmless (signal, resource.set, reload)', async (t) => {
  let late!: () => void;
  const show1 = signal(true);
  mountTest(t, () => h.div(null, show(show1, () => {
    const count = signal(0);
    const r = resource({ loader: async () => 1 });
    late = () => { count.set(5); r.set(2); r.reload(); };
    return h.p(null, count);
  })));
  await settled();
  show1.set(false);
  flush();
  late();
  await settled();
});

// A module-level app resource in createRoot (state.ts): shared by tests, never leaked or reset.
let appLoads = 0;
const session = createRoot(() => resource({ loader: async () => ({ user: `u${++appLoads}` }), debugName: 'session' }));
const appTheme = signal('light');

test('State and lifetime: a module-level createRoot resource is not reported as leaked', async (t) => {
  const view = mountTest(t, () => h.p(null, () => (session.hasValue() ? session.value().user : '...')));
  await settled();
  assert.equal(view.root.textContent, 'u1');
  appTheme.set('dark');
});

test('State and lifetime: the shared resource is not reset between tests (reload() it), module signals are', async (t) => {
  assert.equal(appTheme(), 'light', 'module-level signal reset');
  assert.equal(session.hasValue() && session.value().user, 'u1', 'resource kept');
  const view = mountTest(t, () => h.p(null, () => (session.hasValue() ? session.value().user : '...')));
  session.reload();
  await settled();
  assert.equal(view.root.textContent, 'u2');
});

test('Timers derive time from a clock: now signal + setInterval in onMount + computed elapsed', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 });
  interface Todo { readonly id: number; readonly elapsedMs: number; readonly startedAt: number | null }
  const todos = signal<readonly Todo[]>([{ id: 1, elapsedMs: 500, startedAt: 1_000_000 }, { id: 2, elapsedMs: 7, startedAt: null }]);
  const Row = component(function Row(p: { todo: Read<Todo> }): Node {
    const now = signal(Date.now());
    onMount(() => { const timer = setInterval(() => now.set(Date.now()), 1000); return () => clearInterval(timer); });
    const elapsed = computed(() => { const x = p.todo(); return x.elapsedMs + (x.startedAt === null ? 0 : now() - x.startedAt); });
    return h.li(null, () => String(elapsed()));
  });
  const view = mountTest(t, () => h.ul(null, each(todos, { key: (x) => x.id, render: (todo) => Row({ todo }) })));
  assert.deepEqual(texts(view.root), ['500', '7']);
  t.mock.timers.tick(3000);
  flush();
  assert.deepEqual(texts(view.root), ['3500', '7']);
  todos.update((a) => a.map((x) => (x.id === 1 ? { ...x, elapsedMs: 3500, startedAt: null } : x)));
  flush();
  t.mock.timers.tick(5000);
  flush();
  assert.deepEqual(texts(view.root), ['3500', '7']);
});

test('Persist: the localStorage effect runs in the first flush and on change; a theme effect cleans up on unmount', (t) => {
  localStorage.removeItem('todos');
  const todos = signal<readonly string[]>(['milk']);
  const theme = signal('dark');
  const view = mountTest(t, () => {
    effect(() => { try { localStorage.setItem('todos', JSON.stringify(todos())); } catch { /* quota */ } });
    effect(() => { document.documentElement.setAttribute('data-theme', theme());
      return () => document.documentElement.removeAttribute('data-theme'); });
    return h.p(null, 'x');
  });
  assert.equal(localStorage.getItem('todos'), '["milk"]');
  assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
  todos.set(['milk', 'eggs']);
  theme.set('light');
  flush();
  assert.equal(localStorage.getItem('todos'), '["milk","eggs"]');
  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  view.dispose();
  assert.equal(document.documentElement.hasAttribute('data-theme'), false);
  localStorage.removeItem('todos');
});

test('Children that must see the parent context are functions: Tabs({ tabs: [{ label, render }] })', (t) => {
  const TabCtx = createContext<string>('TabCtx');
  const Tabs = component(function Tabs(p: { tabs: readonly { label: string; render: () => Node }[] }): Node {
    const current = signal(0);
    return provide(TabCtx, 'inside', () => h.div(null,
      h.div({ role: 'tablist' }, p.tabs.map((tab, i) => h.button({ type: 'button', role: 'tab', 'aria-selected': () => current() === i, onclick: () => current.set(i) }, tab.label))),
      match(current, (i) => p.tabs[i]!.render())));
  });
  const Panel = component(function Panel(p: { name: string }): Node {
    const where = useContext(TabCtx);
    return h.p(null, `${p.name} ${where}`);
  });
  const view = mountTest(t, () => Tabs({ tabs: [{ label: 'A', render: () => Panel({ name: 'a' }) }, { label: 'B', render: () => Panel({ name: 'b' }) }] }));
  assert.equal(view.root.querySelector('p')!.textContent, 'a inside');
  press(view.root.querySelectorAll('button')[1]!);
  flush();
  assert.equal(view.root.querySelector('p')!.textContent, 'b inside');
});

// ================================================================ Lists and markup

test('Lists: selector-based selection re-runs only the two rows whose answer flipped; aria-pressed per row', (t) => {
  const selectedId = signal<number | null>(null);
  const items = Array.from({ length: 50 }, (_, i) => ({ id: i, text: `item ${i}` }));
  let runs = 0;
  const view = mountTest(t, () => {
    const isSelected = selector(selectedId);
    return h.ul(null, each(() => items, { key: (x) => x.id, render: (item, _i, id) =>
      h.li({ class: { selected: () => { runs++; return isSelected(item().id); } } },
        h.button({ type: 'button', 'aria-pressed': () => isSelected(id), 'aria-label': () => `Select ${item().text}`, onclick: () => selectedId.set(id) }, 'o')) }));
  });
  runs = 0;
  press(view.root.querySelectorAll('button')[3]!);
  flush();
  assert.equal(runs, 1);
  press(view.root.querySelectorAll('button')[7]!);
  flush();
  assert.equal(runs, 3);
  assert.deepEqual([...view.root.querySelectorAll('.selected')].map((li) => li.textContent), ['o']);
  assert.equal(view.root.querySelectorAll('button')[7]!.getAttribute('aria-pressed'), 'true');
  assert.equal(view.root.querySelectorAll('button')[3]!.getAttribute('aria-pressed'), 'false');
  assert.equal(view.root.querySelectorAll('button')[3]!.getAttribute('aria-label'), 'Select item 3');
});

interface Msg { readonly id: string; readonly text: string }

test('Chat/log: merged sources deduplicated by id; stick-to-bottom flushes before measuring; zero diagnostics', async (t) => {
  const messages = signal<readonly Msg[]>([]);
  const merge = (m: Msg) => messages.update((a) => (a.some((x) => x.id === m.id) ? a.map((x) => (x.id === m.id ? m : x)) : [...a, m]));
  let push!: (m: Msg) => void;
  let rowsAtFlush = -1;
  const view = mountTest(t, () => {
    const list = h.ol({ role: 'log', 'aria-label': 'Messages' }, each(messages, { key: (m) => m.id, render: (m) => h.li(null, () => m().text) }));
    const receive = (m: Msg) => {
      const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      merge(m);
      if (stick) { flush(); rowsAtFlush = list.querySelectorAll('li').length; list.scrollTop = list.scrollHeight; }
    };
    onMount(() => {
      const history = [{ id: 'h1', text: 'hello' }, { id: 'h2', text: 'world' }];
      for (const m of history) receive(m); // a synchronous first callback inside onMount (phase b)
      push = receive;
    });
    return h.div(null, list, h.button({ type: 'button', onclick: () => receive({ id: 'me1', text: 'sending' }) }, 'Send'));
  });
  assert.deepEqual(texts(view.root), ['hello', 'world']);
  assert.equal(rowsAtFlush, 2, 'flush() inside onMount drains phase (a): rows exist before measuring');
  press(view.root.querySelector('button')!);
  assert.equal(rowsAtFlush, 3, 'flush() in a handler inserts the row synchronously');
  push({ id: 'me1', text: 'sent' }); // server echo of our own send
  push({ id: 'h2', text: 'world' }); // history overlap
  flush();
  assert.deepEqual(texts(view.root), ['hello', 'world', 'sent']);
});

test('Chat/log claim: merging without deduplication warns DUPLICATE_KEY', (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const messages = signal<readonly Msg[]>([{ id: 'a', text: '1' }]);
  mountTest(t, () => h.ol({ role: 'log', 'aria-label': 'Messages' }, each(messages, { key: (m) => m.id, render: (m) => h.li(null, () => m().text) })));
  messages.update((a) => [...a, { id: 'a', text: 'echo' }]);
  flush();
  cap.stop();
  assert.deepEqual(cap.codes(), ['DUPLICATE_KEY']);
});

test('Enter-to-send in a textarea: requestSubmit on Enter, not on Shift+Enter or IME (isComposing, keyCode 229)', async (t) => {
  const sent: string[] = [];
  const view = mountTest(t, () => {
    const draft = signal('');
    const form: HTMLFormElement = h.form({ onsubmit: (e) => { e.preventDefault(); if (draft().trim()) { sent.push(draft()); draft.set(''); } } },
      h.label(null, 'Message', h.textarea({ value: draft, oninput: (e) => draft.set(e.currentTarget.value),
        onkeydown: (e) => {
          if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
          e.preventDefault(); form.requestSubmit();
        } })),
      h.button({ type: 'submit' }, 'Send'));
    return form;
  });
  const ta = view.root.querySelector('textarea')!;
  ta.focus();
  const type = (v: string) => { ta.value = v; ta.dispatchEvent(new Event('input')); };
  type('hi');
  ta.dispatchEvent(key('Enter', { shiftKey: true }));
  ta.dispatchEvent(key('Enter', { isComposing: true }));
  ta.dispatchEvent(key('Enter', { keyCode: 229 } as KeyboardEventInit));
  flush();
  assert.deepEqual(sent, []);
  ta.dispatchEvent(key('Enter'));
  flush();
  await tick();
  assert.deepEqual(sent, ['hi']);
  assert.equal(ta.value, '');
  same(document.activeElement, ta);
});

test('Icons: svg() inside a named button; attributes set with setAttribute in the SVG namespace', (t) => {
  const view = mountTest(t, () => h.button({ type: 'button', 'aria-label': 'Add' },
    svg('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' }, svg('path', { d: 'M4 12h16' }))));
  const s = view.root.querySelector('svg')!;
  assert.equal(s.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(s.getAttribute('viewBox'), '0 0 24 24');
  assert.equal(s.getAttribute('width'), '16');
  assert.equal(s.getAttribute('aria-hidden'), 'true');
  assert.equal(s.querySelector('path')!.getAttribute('d'), 'M4 12h16');
});

test('Animation: startViewTransition(() => { s.set(v); flush(); }) updates the DOM inside the callback', (t) => {
  const s = signal('a');
  const startViewTransition = (cb: () => void) => { cb(); };
  let inside = '';
  const view = mountTest(t, () => h.button({ type: 'button', onclick: () => startViewTransition(() => { s.set('b'); flush(); inside = view.root.textContent ?? ''; }) }, s));
  press(view.root.querySelector('button')!);
  assert.equal(inside, 'b');
});

test('Widgets: effect inside onMount updates the widget, destroy runs once on unmount, no update after destroy', (t) => {
  const log: string[] = [];
  const data = signal([1, 2]);
  const makeChart = (el: Element) => ({ update: (d: readonly number[]): void => { log.push(`update ${d.join()} ${el.localName}`); }, destroy: (): void => { log.push('destroy'); } });
  const view = mountTest(t, () => {
    const Chart = component(function Chart(p: { data: Read<readonly number[]> }): Node {
      const el = h.div({ class: 'chart' });
      onMount(() => { const w = makeChart(el); effect(() => w.update(p.data())); return () => w.destroy(); });
      return el;
    });
    return Chart({ data });
  });
  assert.deepEqual(log, ['update 1,2 div'], 'the effect created in onMount runs in the same flush');
  data.set([3]);
  flush();
  data.set([4]);
  view.dispose();
  flush();
  assert.deepEqual(log, ['update 1,2 div', 'update 3 div', 'destroy']);
});

test('Lazy component inside a view: match on the loaded component (a function key)', async (t) => {
  const Chart = component(function Chart(p: { data: Read<readonly number[]> }): Node { return h.p(null, () => `chart ${p.data().join()}`); });
  const d = deferred<{ Chart: typeof Chart }>();
  const data = signal([1]);
  const view = mountTest(t, () => {
    const mod = resource({ loader: () => d.promise });
    return h.div(null, match(() => (mod.hasValue() ? mod.value().Chart : null), (C) => (C ? C({ data }) : 'Loading')));
  });
  assert.equal(view.root.textContent, 'Loading');
  d.resolve({ Chart });
  await settled();
  assert.equal(view.root.textContent, 'chart 1');
  data.set([1, 2]);
  flush();
  assert.equal(view.root.textContent, 'chart 1,2');
});

// ================================================================ Per-param lifecycle (match keyed on a param, no router)

function presence() {
  const subs = new Map<string, (v: readonly string[]) => void>();
  const log: string[] = [];
  const subscribePresence = (room: string, cb: (v: readonly string[]) => void) => {
    log.push(`sub ${room}`);
    subs.set(room, cb);
    cb([`${room}-alice`]); // synchronous first callback
    return () => { log.push(`unsub ${room}`); subs.delete(room); };
  };
  return { subs, log, subscribePresence };
}

test('Per-param lifecycle: match on the param, subscription in onMount (sync first callback), drafts in a parent Map signal', (t) => {
  const { subs, log, subscribePresence } = presence();
  const roomId = signal('r1');
  const drafts = signal<ReadonlyMap<string, string>>(new Map());
  const RoomBody = component(function RoomBody(p: { roomId: string }): Node {
    const online = signal<readonly string[]>([]);
    onMount(() => subscribePresence(p.roomId, online.set));
    return h.div(null, h.p(null, () => online().join()),
      h.label(null, 'Draft', h.input({ value: () => drafts().get(p.roomId) ?? '',
        oninput: (e) => { const v = e.currentTarget.value; drafts.update((m) => new Map(m).set(p.roomId, v)); } })));
  });
  const view = mountTest(t, () => h.section(null, match(roomId, (id) => RoomBody({ roomId: id }))));
  assert.equal(view.root.querySelector('p')!.textContent, 'r1-alice');
  const input = view.root.querySelector('input')!;
  input.value = 'hello r1';
  input.dispatchEvent(new Event('input'));
  subs.get('r1')!(['r1-alice', 'r1-bob']);
  flush();
  assert.equal(view.root.querySelector('p')!.textContent, 'r1-alice,r1-bob');
  roomId.set('r2');
  flush();
  assert.equal(view.root.querySelector('p')!.textContent, 'r2-alice');
  assert.equal(view.root.querySelector('input')!.value, '');
  roomId.set('r1');
  flush();
  assert.equal(view.root.querySelector('input')!.value, 'hello r1', 'draft survived the switch');
  assert.deepEqual(log, ['sub r1', 'unsub r1', 'sub r2', 'unsub r2', 'sub r1']);
});

test('Per-param lifecycle claim: the same subscription in effect() reports EFFECT_WRITES_STATE', (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const { subscribePresence } = presence();
  const roomId = signal('r1');
  mountTest(t, () => {
    const online = signal<readonly string[]>([]);
    effect(() => subscribePresence(roomId(), online.set));
    return h.p(null, () => online().join());
  });
  cap.stop();
  assert.ok(cap.codes().includes('EFFECT_WRITES_STATE'), cap.codes().join());
});

// ================================================================ AGENTS.md examples and claims

interface Todo { readonly id: number; readonly text: string; readonly done: boolean }
interface TodoListProps { todos: Read<readonly Todo[]>; onToggle: (id: number) => void }

const TodoList = component(function TodoList(p: TodoListProps): Node {
  const query = signal('');
  const shown = computed(() => p.todos().filter((t) => t.text.includes(query())));
  return h.section(null,
    h.input({ value: query, oninput: (e) => query.set(e.currentTarget.value), 'aria-label': 'Filter' }),
    show(() => shown().length === 0, () => h.p(null, 'No matches')),
    h.ul(null, each(shown, { key: (t) => t.id, render: (todo) =>
      h.li({ class: { done: () => todo().done } },
        h.button({ onclick: () => p.onToggle(todo().id) }, () => todo().text)) })),
    h.p(null, () => `${shown().length} shown`),
  );
});

test('AGENTS Testing example verbatim: filters', (t) => {
  const view = mountTest(t, () => TodoList({ todos: () => [{ id: 1, text: 'milk', done: false }], onToggle: () => {} }));
  const input = view.root.querySelector('input')!;
  input.value = 'milk';
  input.dispatchEvent(new Event('input'));
  flush();
  assert.equal(view.root.querySelectorAll('li').length, 1);
});

test('AGENTS Example: TodoList filters, toggles in place, shows "No matches", zero diagnostics', (t) => {
  const todos = signal<readonly Todo[]>([{ id: 1, text: 'milk', done: false }, { id: 2, text: 'eggs', done: false }]);
  const view = mountTest(t, () => TodoList({ todos, onToggle: (id) => todos.update((a) => a.map((x) => (x.id === id ? { ...x, done: !x.done } : x))) }));
  const li = view.root.querySelector('li')!;
  press(li.querySelector('button')!);
  flush();
  same(view.root.querySelector('li'), li, 'same key + new object updates the row in place');
  assert.equal(li.className, 'done');
  const input = view.root.querySelector('input')!;
  input.focus();
  input.value = 'zzz';
  input.dispatchEvent(new Event('input'));
  flush();
  assert.deepEqual(texts(view.root, 'p'), ['No matches', '0 shown']);
  input.value = 'egg';
  input.dispatchEvent(new Event('input'));
  flush();
  assert.deepEqual(texts(view.root), ['eggs']);
  assert.deepEqual(texts(view.root, 'p'), ['1 shown']);
});

test('AGENTS reactive rule: s.set(v) is visible at once; DOM, effects and row items update on the next microtask', async (t) => {
  const count = signal(0);
  const list = signal([{ id: 1, n: 0 }]);
  const seen: number[] = [];
  let item!: Read<{ id: number; n: number }>;
  const view = mountTest(t, () => {
    effect(() => { seen.push(count()); });
    return h.div(null, h.p(null, count), each(list, { key: (x) => x.id, render: (x) => { item = x; return h.span(null, () => String(x().n)); } }));
  });
  assert.deepEqual(seen, [0], 'effect runs in the first flush');
  count.set(1);
  list.set([{ id: 1, n: 5 }]);
  assert.equal(count(), 1);
  assert.equal(view.root.querySelector('p')!.textContent, '0');
  assert.equal(item().n, 0, 'row item lags until the flush');
  await Promise.resolve();
  assert.equal(view.root.querySelector('p')!.textContent, '1');
  assert.equal(item().n, 5);
  assert.deepEqual(seen, [0, 1]);
});

test('AGENTS claim: h.p(null, count()) never updates and reports STRICT_READ_UNTRACKED; h.p(null, count) updates', (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const count = signal(1);
  const view = mountTest(t, () => h.div(null, h.p(null, count()), h.p(null, count)));
  count.set(2);
  flush();
  cap.stop();
  assert.deepEqual(texts(view.root, 'p'), ['1', '2']);
  assert.deepEqual(cap.codes(), ['STRICT_READ_UNTRACKED']);
});

test('AGENTS: linkedSignal({ source: p.userId, computation: () => "" }) resets when the input changes', (t) => {
  const userId = signal(1);
  const Note = component(function Note(p: { userId: Read<number> }): Node {
    const draft = linkedSignal({ source: p.userId, computation: () => '' });
    return h.label(null, 'Note', h.input({ value: draft, oninput: (e) => draft.set(e.currentTarget.value) }));
  });
  const view = mountTest(t, () => Note({ userId }));
  const input = view.root.querySelector('input')!;
  input.value = 'typed';
  input.dispatchEvent(new Event('input'));
  flush();
  assert.equal(input.value, 'typed');
  userId.set(2);
  flush();
  assert.equal(input.value, '');
});

test('AGENTS Components: optional Read prop, function prop for content that may not render', (t) => {
  const Card = component(function Card(p: { title: Read<string>; sub?: Read<string> | undefined; panel?: (() => Node) | undefined }): Node {
    return h.article(null, h.h2(null, p.title), show(() => p.sub?.(), (s) => h.p(null, s)), p.panel ? show(() => true, p.panel) : null);
  });
  const sub = signal('');
  const view = mountTest(t, () => h.div(null, Card({ title: () => 'A' }), Card({ title: () => 'B', sub, panel: () => h.p(null, 'panel') })));
  assert.deepEqual(texts(view.root, 'p'), ['panel']);
  sub.set('subtitle');
  flush();
  assert.deepEqual(texts(view.root, 'p'), ['subtitle', 'panel']);
});

test('AGENTS claim: a consumer passed as children is created before the provider (NO_PROVIDER); a function prop works', (t) => {
  const Ctx = createContext<string>('Ctx');
  const Consumer = component(function Consumer(): Node { return h.p(null, useContext(Ctx)); });
  const Provider = component(function Provider(p: { panel: () => Node }): Node { return provide(Ctx, 'v', () => h.div(null, p.panel())); });
  const view = mountTest(t, () => Provider({ panel: () => Consumer() }));
  assert.equal(view.root.textContent, 'v');
  assert.throws(() => mountTest(t, () => {
    const P2 = component(function P2(p: { child: Node }): Node { return provide(Ctx, 'v', () => h.div(null, p.child)); });
    return P2({ child: Consumer() });
  }), (e: { diag?: { code: string } }) => e.diag?.code === 'NO_PROVIDER');
});

test('AGENTS Markup: style object with a live custom property, htmlFor, aria/data attributes, e.currentTarget', (t) => {
  const g = signal('4px');
  let target: EventTarget | null = null;
  const view = mountTest(t, () => h.div({ style: { marginTop: '4px', '--gap': () => g() }, 'data-state': 'open' },
    h.label({ htmlFor: 'f1' }, 'Field'), h.input({ id: 'f1' }),
    h.button({ type: 'button', 'aria-expanded': () => g() === '8px', onclick: (e) => { target = e.currentTarget; } }, 'Go')));
  const div = view.root.firstElementChild as HTMLElement;
  assert.equal(div.style.marginTop, '4px');
  assert.equal(div.style.getPropertyValue('--gap'), '4px');
  const btn = view.root.querySelector('button')!;
  btn.click();
  same(target, btn, 'e.currentTarget is the element');
  g.set('8px');
  flush();
  assert.equal(div.style.getPropertyValue('--gap'), '8px');
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(view.root.querySelector('label')!.htmlFor, 'f1');
});

test('AGENTS: css`...` is a global adopted sheet, once per call site', (t) => {
  const make = () => css`.card { .title { font-weight: 600; } }`;
  const a = make();
  const b = make();
  assert.ok(a === b);
  assert.ok(document.adoptedStyleSheets.includes(a));
  mountTest(t, () => h.div({ class: 'card' }, h.span({ class: 'title' }, 'x')));
});

function boundary(t: Parameters<typeof mountTest>[0], chartHasButton: boolean) {
  let fail = true;
  const Chart = component(function Chart(): Node {
    if (fail) throw new Error('boom');
    return chartHasButton ? h.div(null, h.button({ type: 'button' }, 'Zoom')) : h.p(null, 'chart');
  });
  const Retry = component(function Retry(p: { reset: () => void }): Node {
    return h.button({ type: 'button', onclick: () => { fail = false; p.reset(); } }, 'Retry');
  });
  return mountTest(t, () => h.section(null, catchError(() => Chart(), (_err, reset) => Retry({ reset }))));
}

test('AGENTS Boundary catchError(() => Chart(), (err, reset) => Retry({ reset })): a focused Retry hands focus to the new content on reset (no FOCUS_LOST)', async (t) => {
  const view = boundary(t, true);
  const retry = view.root.querySelector('button')!;
  press(retry);
  flush();
  await tick();
  const zoom = view.root.querySelector('button')!;
  assert.equal(zoom.textContent, 'Zoom');
  same(document.activeElement, zoom, 'B8.5: focus moves to the first focusable element of the new content');
});

test('AGENTS Boundary: an effect error while focus is inside the try content focuses the fallback (B8.5)', async (t) => {
  const boom = signal(false);
  const Chart = component(function Chart(): Node {
    effect(() => { if (boom()) throw new Error('late'); });
    return h.button({ type: 'button' }, 'Zoom');
  });
  const view = mountTest(t, () => h.section(null, catchError(() => Chart(), (_e, reset) => h.button({ type: 'button', onclick: reset }, 'Retry'))));
  view.root.querySelector('button')!.focus();
  boom.set(true);
  flush();
  await tick();
  assert.equal(document.activeElement?.textContent, 'Retry');
});

test('AGENTS Async example: gate on hasValue(), new params abort the old load and its late result is dropped', async (t) => {
  interface User { readonly name: string }
  const loads = new Map<number, { d: ReturnType<typeof deferred<User>>; signal: AbortSignal }>();
  const getUser = (id: number, abortSignal: AbortSignal) => { const d = deferred<User>(); loads.set(id, { d, signal: abortSignal }); return d.promise; };
  const id = signal(1);
  const UserView = component(function UserView(p: { id: Read<number> }): Node {
    const user = resource({ params: () => p.id(), loader: ({ params, abortSignal }) => getUser(params, abortSignal) });
    return h.div(null, show(() => user.hasValue() && user.value(), (u) => h.h2(null, () => u().name), () => h.p({ role: 'status' }, 'Loading')));
  });
  const view = mountTest(t, () => UserView({ id }));
  assert.equal(view.root.textContent, 'Loading');
  id.set(2);
  flush();
  assert.equal(loads.get(1)!.signal.aborted, true);
  loads.get(1)!.d.resolve({ name: 'late one' });
  await tick();
  flush();
  assert.equal(view.root.textContent, 'Loading');
  loads.get(2)!.d.resolve({ name: 'Two' });
  await settled();
  assert.equal(view.root.textContent, 'Two');
});

test('AGENTS Context example verbatim: provide/useContext, onMount listener with abortSignal and interval cleanup, title effect', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const Toast = createContext<(msg: string) => void>('Toast');
  const notes: string[] = [];
  let fits = 0;
  let ticks = 0;
  const Page = component(function Page(): Node {
    const toast = useContext(Toast);
    const count = signal(0);
    const fit = () => { fits++; };
    const tickFn = () => { ticks++; };
    onMount(({ abortSignal }) => {
      window.addEventListener('resize', fit, { signal: abortSignal });
      const timer = setInterval(tickFn, 1000); return () => clearInterval(timer);
    });
    effect(() => { document.title = `${count()} items`; });
    return h.button({ type: 'button', onclick: () => { count.update((c) => c + 1); toast('added'); } }, 'Add');
  });
  const notify = (m: string) => { notes.push(m); };
  const view = mountTest(t, () => provide(Toast, notify, () => Page()));
  assert.equal(document.title, '0 items');
  press(view.root.querySelector('button')!);
  flush();
  assert.equal(document.title, '1 items');
  assert.deepEqual(notes, ['added']);
  window.dispatchEvent(new Event('resize'));
  t.mock.timers.tick(2000);
  assert.deepEqual([fits, ticks], [1, 2]);
  view.dispose();
  window.dispatchEvent(new Event('resize'));
  t.mock.timers.tick(2000);
  assert.deepEqual([fits, ticks], [1, 2], 'listener and interval gone after unmount');
});

test('AGENTS claim: a timer or window listener created in setup reports LEAK_IN_SETUP', (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  let timer: ReturnType<typeof setInterval> | undefined;
  const Bad = component(function Bad(): Node {
    timer = setInterval(() => {}, 1000);
    return h.p(null, 'x');
  });
  const view = mountTest(t, () => Bad());
  clearInterval(timer);
  view.dispose();
  cap.stop();
  assert.deepEqual(cap.codes(), ['LEAK_IN_SETUP']);
});

test('B20.3: catchError reset into an element with nothing focusable focuses it and does not report FOCUS_LOST', async (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const view = boundary(t, false);
  press(view.root.querySelector('button')!);
  flush();
  await tick();
  cap.stop();
  assert.equal(view.root.textContent, 'chart');
  assert.deepEqual(cap.codes(), []);
});

test('Inline edit tested the (g) way (Enter keydown, await a microtask, then the default action) reports nothing', async (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const { titleBtn, input } = inlineList(t);
  press(titleBtn()!);
  flush();
  input()!.value = 'New';
  input()!.dispatchEvent(key('Enter'));
  await Promise.resolve(); // the check runs here, as in a browser before implicit submission
  input()!.form!.requestSubmit(); // happy-dom has no implicit submission: the test does it
  flush();
  await settled().catch(() => {});
  cap.stop();
  assert.deepEqual(cap.codes(), [], 'correct recipe code; in a browser the check microtask runs before implicit submission');
});

// ================================================================ more recipe interactions

test('Inline edit + optimistic rename on the shared resource: row kept, focus back on the title, value confirmed', async (t) => {
  t.mock.method(AbortSignal, 'timeout', () => new AbortController().signal);
  serverCards = [{ id: 'c1', title: 'Server' }];
  listImpl = async () => serverCards.map((c) => ({ ...c }));
  saves.length = 0;
  const view = mountTest(t, () => h.ul(null, each(() => (cards.hasValue() ? cards.value() : []), {
    key: (c) => c.id, render: (card, _i, id) => InlineRow({ card, onRename: (title) => rename(String(id), title) }) })));
  cards.reload();
  await settled();
  const li = view.root.querySelector('li')!;
  press(li.querySelector('button')!);
  flush();
  const input = li.querySelector('input')!;
  input.value = 'Renamed';
  input.form!.requestSubmit();
  flush();
  same(view.root.querySelector('li'), li, 'the optimistic set() keeps the row');
  assert.equal(li.textContent, 'Renamed');
  same(document.activeElement, li.querySelector('button'));
  while (saves.length < 1) await tick();
  saves[0]!.d.resolve();
  await settled();
  assert.equal(li.textContent, 'Renamed');
  assert.equal(cards.status(), 'local');
});

test('Debounce: clearing the query mid-delay goes idle without an error or a search', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const searches: string[] = [];
  const delay = (ms: number, s: AbortSignal) => new Promise<void>((ok, fail) => {
    const timer = setTimeout(ok, ms); s.addEventListener('abort', () => { clearTimeout(timer); fail(s.reason); }); });
  const query = signal('');
  let r!: ReturnType<typeof resource<readonly string[]>>;
  mountTest(t, () => {
    r = resource({ params: () => query() || undefined,
      loader: async ({ params, abortSignal }) => { await delay(300, abortSignal); searches.push(params); return [params]; } });
    return h.p(null, () => r.status());
  });
  query.set('a');
  flush();
  assert.equal(r.status(), 'loading');
  query.set('');
  flush();
  t.mock.timers.tick(1000);
  await settled();
  assert.equal(r.status(), 'idle');
  assert.deepEqual(searches, []);
});

test('Selection: a selected row filtered out and back in is still selected; selecting a key with no row is fine', (t) => {
  const selectedId = signal<number | null>(2);
  const all = [0, 1, 2, 3].map((id) => ({ id }));
  const filter = signal<(x: { id: number }) => boolean>(() => true);
  const view = mountTest(t, () => {
    const isSelected = selector(selectedId);
    return h.ul(null, each(() => all.filter(filter()), { key: (x) => x.id, render: (item, _i, id) =>
      h.li({ class: { selected: () => isSelected(item().id) } }, h.button({ type: 'button', 'aria-pressed': () => isSelected(id) }, String(id))) }));
  });
  const sel = () => [...view.root.querySelectorAll('.selected')].map((x) => x.textContent);
  assert.deepEqual(sel(), ['2']);
  filter.set((x: { id: number }) => x.id !== 2);
  flush();
  assert.deepEqual(sel(), []);
  selectedId.set(9);
  flush();
  selectedId.set(2);
  flush();
  filter.set(() => true);
  flush();
  assert.deepEqual(sel(), ['2']);
  selectedId.set(3);
  flush();
  assert.deepEqual(sel(), ['3']);
  assert.equal(view.root.querySelectorAll('button')[2]!.getAttribute('aria-pressed'), 'false');
});

test('State and lifetime: onMount writes per row are silent', (t) => {
  const mounted = signal(0);
  const rows = signal([1, 2, 3]);
  const view = mountTest(t, () => h.div(null, h.p(null, () => String(mounted())),
    h.ul(null, each(rows, { key: (x) => x, render: (_x, _i, k) => { onMount(() => { mounted.update((c) => c + 1); return () => mounted.update((c) => c - 1); }); return h.li(null, String(k)); } }))));
  assert.equal(view.root.querySelector('p')!.textContent, '3');
  rows.set([1]);
  flush();
  assert.equal(view.root.querySelector('p')!.textContent, '1');
});

test('AGENTS: jasno disposes what setup created: removing a component aborts its resource load', async (t) => {
  const on = signal(true);
  let aborted: AbortSignal | undefined;
  const Loader = component(function Loader(): Node {
    const r = resource({ loader: ({ abortSignal }) => { aborted = abortSignal;
      return new Promise<string>((_ok, fail) => abortSignal.addEventListener('abort', () => fail(abortSignal.reason))); } });
    return h.p(null, () => r.status());
  });
  mountTest(t, () => h.div(null, show(on, () => Loader())));
  assert.equal(aborted!.aborted, false);
  on.set(false);
  flush();
  assert.equal(aborted!.aborted, true);
  assert.equal((aborted!.reason as DOMException).name, 'AbortError');
});

test('Per-param lifecycle: an unsubscribe that emits one last value writes a dead signal silently', (t) => {
  const roomId = signal('r1');
  const Body = component(function Body(p: { roomId: string }): Node {
    const online = signal<readonly string[]>([]);
    onMount(() => { online.set([`${p.roomId}-me`]); return () => online.set([]); });
    return h.p(null, () => online().join());
  });
  const view = mountTest(t, () => h.div(null, match(roomId, (id) => Body({ roomId: id }))));
  assert.equal(view.root.textContent, 'r1-me');
  roomId.set('r2');
  flush();
  assert.equal(view.root.textContent, 'r2-me');
});

test('Inline edit: editing row A then clicking row B title saves A (blur) and opens B with focus in B, no FOCUS_LOST', async (t) => {
  const cards = signal<readonly Card[]>([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
  const renames: string[] = [];
  const view = mountTest(t, () => h.ul(null, each(cards, { key: (c) => c.id, render: (card, _i, id) => InlineRow({ card, onRename: async (title) => {
    renames.push(`${id}:${title}`); cards.update((a) => a.map((c) => (c.id === id ? { ...c, title } : c))); } }) })));
  const rows = () => [...view.root.querySelectorAll('li')];
  press(rows()[0]!.querySelector('button')!);
  flush();
  rows()[0]!.querySelector('input')!.value = 'A2';
  press(rows()[1]!.querySelector('button')!); // mousedown focus moves: blur on A's input, then click on B
  flush();
  await settled();
  assert.deepEqual(renames, ['a:A2']);
  same(document.activeElement, rows()[1]!.querySelector('input'), "B's input focused in onMount");
  assert.equal(rows()[0]!.textContent, 'A2');
});

test('Mutations: a save that succeeds while a reload() is in flight wins without RESOURCE_SET_WHILE_LOADING', async (t) => {
  const { title, until } = await cardList(t);
  const pa = rename('c1', 'A');
  await until(1);
  const slow = deferred<readonly Card[]>();
  listImpl = () => slow.promise;
  cards.reload();
  flush();
  assert.equal(cards.status(), 'reloading');
  saves[0]!.d.resolve();
  await pa;
  flush();
  assert.equal(title(), 'A');
  slow.resolve([{ id: 'c1', title: 'Stale' }]); // aborted by set(): dropped
  await settled();
  assert.equal(title(), 'A');
});

test('AGENTS claim: a loader that reads a signal reports LOADER_READ_UNTRACKED; params: () => query() is silent', async (t) => {
  const cap = capture();
  t.after(() => cap.stop());
  const query = signal('a');
  mountTest(t, () => {
    resource({ loader: async () => query(), debugName: 'bad' });
    resource({ params: () => query(), loader: async ({ params }) => params, debugName: 'good' });
    return h.p(null, 'x');
  });
  await settled();
  cap.stop();
  assert.deepEqual(cap.codes(), ['LOADER_READ_UNTRACKED']);
});

test('AGENTS Lists: a row dies when its key leaves the list; state that must survive lives in the item', (t) => {
  const all = [{ id: 1, likes: 0 }, { id: 2, likes: 0 }];
  const items = signal<readonly { id: number; likes: number }[]>(all);
  const view = mountTest(t, () => h.ul(null, each(items, { key: (x) => x.id, render: (item, _i, id) => {
    const local = signal(0);
    return h.li(null, h.button({ type: 'button', 'aria-label': `Like ${id}`, onclick: () => {
      local.update((n) => n + 1);
      items.update((a) => a.map((x) => (x.id === id ? { ...x, likes: x.likes + 1 } : x)));
    } }, () => `${local()}/${item().likes}`));
  } })));
  view.root.querySelector('button')!.click();
  flush();
  assert.deepEqual(texts(view.root), ['1/1', '0/0']);
  const kept = items();
  items.set(kept.filter((x) => x.id !== 1));
  flush();
  items.set(kept);
  flush();
  assert.deepEqual(texts(view.root), ['0/1', '0/0'], 'row-local state reset, item state kept');
});

// ================================================================ settled() and superseded loaders (keep these last: they leave a pending promise)

test('Loading UI tested with a never-settling fake loader (spinner test)', (t) => {
  const view = mountTest(t, () => {
    const user = resource({ loader: () => new Promise<string>(() => {}), debugName: 'spinnerUser' });
    return h.p({ role: 'status' }, () => (user.isLoading() ? 'Loading' : 'done'));
  });
  assert.equal(view.root.textContent, 'Loading');
});

test('settled() in the next test does not wait for the previous test\'s disposed, aborted loader', async (t) => {
  mountTest(t, () => h.p(null, 'unrelated'));
  await settled({ timeout: 300 }); // SETTLE_TIMEOUT: pending: loader of spinnerUser
});
