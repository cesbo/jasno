// Every snippet of the RECIPES block at the top of jasno.d.ts, in context. Must compile with 0 errors.
import { bindChecked, bindNumber, bindValue, component, computed, createRoot, each, effect, flush, h, match, onMount, optimistic, resource, selector, show, signal, svg, untracked, type MaybeRead, type Read } from '@jasno/core';
import { createRouter, route, type ViewProps } from '@jasno/core/router';
import { addNote, getUser, listCards, listNotes, makeChart, saveTitle, search, subscribePresence, type Card } from './api.ts';
import { router } from './routes.ts';

// Forms
export const EmailForm = component(function EmailForm(p: { save: (email: string) => Promise<void> }): Node {
  const email = signal('');
  const emailOk = signal(false);
  const saving = signal(false);
  const plan = signal<'free' | 'pro'>('free');
  const seats = signal<number | undefined>(1);
  const agree = signal(false);
  const country = signal('nl');
  const seatsError = computed(() => { const n = seats(); return n !== undefined && n > 100 ? 'At most 100 seats' : undefined; });
  const save = async () => { if (saving()) return; saving.set(true); try { await p.save(email()); } finally { saving.set(false); } };
  const seatsInput = h.input({ type: 'number', min: '1', required: true, ...bindNumber(seats) });
  effect(() => seatsInput.setCustomValidity(seatsError() ?? ''));
  return h.form({ onsubmit: (e) => { e.preventDefault(); return save(); } },
    h.label(null, 'Email ', h.input({ type: 'email', required: true, value: email,
      oninput: (e) => { email.set(e.currentTarget.value); emailOk.set(e.currentTarget.validity.valid); } })),
    h.label(null, h.input({ type: 'radio', name: 'plan', checked: () => plan() === 'pro', onchange: () => plan.set('pro') }), 'Pro'),
    h.label(null, 'Seats ', seatsInput),
    h.label(null, h.input({ type: 'checkbox', ...bindChecked(agree) }), ' I agree'),
    h.label(null, 'Country ', h.select({ ...bindValue(country) }, h.option({ value: 'nl' }, 'Netherlands'), h.option({ value: 'de' }, 'Germany'))),
    show(emailOk, () => 'valid'),
    h.button({ type: 'submit', 'aria-disabled': saving }, 'Save'))       // guard with if (saving()) return
});
export const Draft = component(function Draft(p: { card: Read<Card> }): Node {
  return h.input({ value: untracked(p.card).title, 'aria-label': 'Title' });
});
export const DraftName = component(function DraftName(p: { draft: Read<{ readonly name: string }>; patch: (key: 'name', value: string) => void }): Node {
  return h.input({ ...bindValue(() => p.draft().name, (v) => p.patch('name', v)), 'aria-label': 'Name' });
});

// Inline edit
export const CardTitle = component(function CardTitle(p: { card: Read<Card>; onRename: (title: string) => void }): Node {
  const editing = signal(false);
  let refocus = false;
  return h.div(null, show(editing, () => {
    const commit = (again: boolean) => { refocus = again; editing.set(false);
      const title = input.value.trim(); if (title && title !== p.card().title) return p.onRename(title); };
    const input = h.input({ value: untracked(p.card).title, 'aria-label': 'Title',
      onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); refocus = true; editing.set(false); } },
      onblur: () => { if (editing()) commit(false); } });      // Chromium also fires blur when the input is removed
    onMount(() => { input.focus(); input.select(); });
    return h.form({ onsubmit: (e) => { e.preventDefault(); return commit(true); } }, input);
  }, () => {
    const title = h.button({ type: 'button', onclick: () => editing.set(true) }, () => p.card().title);
    if (refocus) { refocus = false; onMount(() => title.focus()); }
    return title;
  }));
});

// Mutations
export const Notes = component(function Notes(p: ViewProps<'/users/:id'>): Node {
  const notes = resource({ params: () => p.params().id, loader: ({ params, abortSignal }) => listNotes(params, abortSignal) });
  async function add(text: string): Promise<void> {
    const id = p.params().id;
    await addNote(id, text);
    if (p.params().id === id) notes.reload();       // the kept-mounted view may show another :id by now
  }
  return h.section(null, h.h1(null, 'Notes'), h.button({ onclick: () => void add('x') }, 'Add'),
    each(() => (notes.hasValue() ? notes.value() : []), { key: (n) => n.id, render: (n) => h.p(null, () => n().text) }));
});

declare function toast(message: string): void;
export const cards = createRoot(() => resource({ loader: ({ abortSignal }) => listCards(abortSignal) }));
const save = optimistic(cards, {
  get: (list, id: string) => list.find((c) => c.id === id)?.title,
  put: (list, id, title) => list.map((c) => (c.id === id ? { ...c, title } : c)),
  send: (id, title, abortSignal) => saveTitle(id, title, abortSignal),   // abortSignal times out after 10 s
});
export async function rename(id: string, title: string): Promise<void> {
  if (await save(id, title) === 'undone') toast('Not saved; your change was undone');
}
export const newId = () => crypto.randomUUID();

// Modal dialog, detail over a list, toasts
export const Danger = component(function Danger(p: { remove: () => Promise<void> }): Node {
  const remove = p.remove;
  const dialog = h.dialog({ 'aria-labelledby': 'del-title',
    onclose: (e) => { if (e.currentTarget.returnValue === 'yes') return remove(); } },
    h.form({ method: 'dialog' }, h.h2({ id: 'del-title' }, 'Delete this contact?'),
      h.button({ value: 'no', autofocus: true }, 'Cancel'), h.button({ value: 'yes' }, 'Delete')));
  const menu = h.div({ popover: 'auto', id: 'menu' }, 'Menu');
  return h.div(null, dialog, menu,
    h.button({ type: 'button', onclick: () => { dialog.returnValue = ''; dialog.showModal(); } }, 'Delete'),
    h.button({ type: 'button', popoverTargetElement: menu }, 'More'));
});
const CardDialog = component(function CardDialog(p: { id: string; heading: HTMLElement }): Node {
  const dialog = h.dialog({ 'aria-labelledby': 'card-title', onclose: () => {   // close also fires after Back removed it
      const a = document.activeElement;  // a deep link has no opener: focus is still inside, or on body (WebKit)
      if (!a || a === document.body || dialog.contains(a)) p.heading.focus();
      if (router.url().searchParams.get('card') === p.id) void router.back(router.url().pathname); } },
    h.h2({ id: 'card-title' }, 'Card ', p.id), h.form({ method: 'dialog' }, h.button(null, 'Close')));
  onMount(() => { dialog.showModal(); return () => dialog.close(); });
  return dialog;
});
export const Board = component(function Board(): Node {
  const heading = h.h1({ tabIndex: -1 }, 'Board');
  const cardId = computed(() => router.url().searchParams.get('card'));
  return h.section(null, heading, h.a({ href: '?card=' + '7' }, 'Open'),
    match(cardId, (id) => (id === null ? '' : CardDialog({ id, heading }))));
});
export const Toasts = component(function Toasts(p: { toasts: Read<readonly { id: number; text: string }[]>; dismiss: (id: number) => void }): Node {
  const toasts = p.toasts;
  const dismiss = p.dismiss;
  const region: HTMLUListElement = h.ul({ 'aria-live': 'polite', tabIndex: -1 }, each(toasts, { key: (t) => t.id,
    render: (t, _i, id) => {
      const close = () => { if (row.contains(document.activeElement))
        ((row.nextElementSibling ?? row.previousElementSibling)?.querySelector('button') ?? region).focus(); dismiss(id); };
      onMount(() => { const timer = setTimeout(close, 5000); return () => clearTimeout(timer); });
      const row = h.li(null, () => t().text, h.button({ onclick: close, 'aria-label': 'Dismiss' }, 'x'));
      return row; } }));
  return region;
});

// Focus on change only; status region
export const Step = component(function Step(p: { title: string; focus: boolean; message: Read<string> }): Node {
  const el = h.h2({ tabIndex: -1 }, p.title);
  if (p.focus) onMount(() => el.focus());
  return h.section(null, el, h.p({ role: 'status' }, () => p.message()));
});
export const RetryBox = component(function RetryBox(): Node {
  const r = resource({ loader: async () => [1] });
  const status = h.p({ role: 'status', tabIndex: -1 }, () => (r.status() === 'error' ? 'Could not load.' : ''));
  return h.section(null, status, show(() => r.status() === 'error', () =>
    h.button({ type: 'button', onclick: () => { status.focus(); r.reload(); } }, 'Retry')));
});

// Polling, debounce, keep last value
const delay = (ms: number, s: AbortSignal) => new Promise<void>((ok, fail) => {
  const t = setTimeout(ok, ms); s.addEventListener('abort', () => { clearTimeout(t); fail(s.reason); }); });
export const Dashboard = component(function Dashboard(p: { query: Read<string> }): Node {
  const metrics = resource({ loader: async () => [1, 2, 3] });
  const visible = signal(!document.hidden);
  onMount(({ abortSignal }) => document.addEventListener('visibilitychange', () => {
    visible.set(!document.hidden); if (!document.hidden && !metrics.isLoading()) metrics.reload(); }, { signal: abortSignal }));
  effect(() => { if (!visible() || metrics.isLoading()) return;
    const t = setTimeout(() => metrics.reload(), 5000); return () => clearTimeout(t); });
  const results = resource({ params: () => p.query() || undefined,
    loader: async ({ params, abortSignal }) => { await delay(300, abortSignal); return search(params, abortSignal); } });
  return h.div(null,
    h.p({ role: 'alert' }, () => (metrics.status() === 'error' ? 'Could not refresh.' : '')),
    show(() => metrics.latest(), (m) => h.p(null, () => m().join(', ')), () => h.p(null, 'Loading')),
    h.p(null, () => (results.hasValue() ? results.value().length : 0)));
});

// Router recipes
export const Search = component(function Search(): Node {
  const q = computed(() => router.url().searchParams.get('q') ?? '');
  const set = (v: string) => void router.navigate('?q=' + encodeURIComponent(v), { replace: true });
  return h.section(null, h.h1(null, 'Search'),
    h.input({ type: 'search', 'aria-label': 'Search', value: q, oninput: (e) => set(e.currentTarget.value) }),
    h.a({ href: '?q=x' }, 'x'),
    h.button({ onclick: () => void router.navigate(router.url().pathname, { replace: true }) }, 'Clear'),
    h.a({ href: () => router.href('/users/:id', { id: 7 }) + router.url().search }, 'Ada'),
    h.button({ onclick: () => void router.back('/') }, 'Close'));
});
const menu = [['/', 'Home'], ['/users', 'Users']] as const;
const NavLink = component(function NavLink(p: { path: (typeof menu)[number][0]; label: string }): Node {
  return h.a({ href: router.href(p.path), 'aria-current': () => {
    const here = router.url().pathname;
    return here === p.path ? 'page' : here.startsWith(p.path + '/') ? 'true' : null;
  } }, p.label);
});
export const Nav = component(function Nav(): Node {
  return h.nav({ 'aria-label': 'Main' }, menu.map(([path, label]) => NavLink({ path, label })));
});
const session = signal<string | null>(null);
export const guardLoader = async () => { if (!session()) { void router.navigate('/login', { replace: true }); return null; } return session(); };
export const guardedRouter = createRouter([
  route('/account/:id', {
    loader: async ({ params, abortSignal }) => {
      if (!session()) { void router.navigate('/login', { replace: true }); return null; }
      return getUser(params.id, abortSignal);
    },
    view: () => import('./views/guarded.ts'),
  }),
  route('/settings/:tab(profile|billing)', { view: () => import('./views/settings.ts') }),
], { error: () => h.p(null, 'Error'), notFound: () => h.h1(null, 'Not found') });
const Login = component(function Login(): Node { return h.h1(null, 'Sign in'); });
export const Shell = component(function Shell(): Node {
  return h.main(null, show(session, () => router.outlet(), () => Login()));
});
export const Tabs = component(function Tabs(p: ViewProps<'/settings/:tab(profile|billing)'>): Node {
  return h.section(null, h.h1(null, 'Settings'), match(() => p.params().tab, (tab) => h.p(null, tab)));
});
const RoomBody = component(function RoomBody(p: { roomId: string }): Node {
  const online = signal<readonly string[]>([]);
  onMount(() => subscribePresence(p.roomId, online.set));   // a synchronous first callback is fine
  return h.p(null, () => online().join(', '));
});
export const Room = component(function Room(p: ViewProps<'/rooms/:roomId'>): Node {
  const drafts = signal<ReadonlyMap<string, string>>(new Map());
  return h.section(null, h.h1(null, () => p.params().roomId), h.p(null, () => drafts().get(p.params().roomId) ?? ''),
    match(() => p.params().roomId, (id) => RoomBody({ roomId: id })));
});
export const startAt = (url: string) => history.replaceState(null, '', url);   // route tests only
export const TitleByView = component(function TitleByView(): Node {
  const name = signal('Ada');
  effect(() => { document.title = name(); });
  return h.h1(null, name);
});
export const LazyChart = component(function LazyChart(p: { data: Read<readonly number[]> }): Node {
  const data = p.data;
  const mod = resource({ loader: () => import('./chart.ts') });
  return h.div(null, match(() => (mod.hasValue() ? mod.value().Chart : null), (Chart) => (Chart ? Chart({ data }) : 'Loading')));
});

// State and lifetime: clock, persistence, render-function children
export const Stopwatch = component(function Stopwatch(p: { todo: Read<{ elapsedMs: number; startedAt: number | null }> }): Node {
  const todo = p.todo;
  const now = signal(Date.now());
  onMount(() => { const t = setInterval(() => now.set(Date.now()), 1000); return () => clearInterval(t); });
  const elapsed = computed(() => { const t = todo(); return t.elapsedMs + (t.startedAt === null ? 0 : now() - t.startedAt); });
  const todos = signal<readonly string[]>([]);
  effect(() => { try { localStorage.setItem('todos', JSON.stringify(todos())); } catch { } });
  return h.p(null, () => `${Math.round(elapsed() / 1000)}s`);
});
export const TabsBox = component(function TabsBox(p: { tabs: readonly { label: string; render: () => Node }[] }): Node {
  const current = signal(0);
  return h.div(null, match(current, (i) => p.tabs[i]?.render() ?? ''));
});
export const usesTabs = () => TabsBox({ tabs: [{ label: 'A', render: () => h.p(null, 'A') }] });

// Static-or-live props
export const Hinted = component(function Hinted(p: { label: string; hint?: MaybeRead<string | undefined> | undefined }): Node {
  const hint = () => (typeof p.hint === 'function' ? p.hint() : p.hint);
  return h.label(null, p.label, ' ', h.input({ type: 'text' }), h.small(null, () => hint() ?? ''));
});
export const usesHinted = (ifText: Read<string>) => [Hinted({ label: 'Qty', hint: 'Default 1' }), Hinted({ label: 'Frequency', hint: ifText })];

// Lists and markup: selection, row names, icons, transitions, widgets
interface Message { readonly id: string; readonly text: string }
export const Log = component(function Log(): Node {
  const messages = signal<readonly Message[]>([]);
  const list = h.ol({ role: 'log', 'aria-label': 'Messages' }, each(messages, { key: (m) => m.id, render: (m) => h.li(null, () => m().text) }));
  const receive = (m: Message) => {
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    messages.update((a) => [...a, m]); if (stick) { flush(); list.scrollTop = list.scrollHeight; }
  };
  const input = h.textarea({ 'aria-label': 'Message', onkeydown: (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault(); form.requestSubmit(); } });
  const form = h.form({ onsubmit: (e) => { e.preventDefault(); receive({ id: crypto.randomUUID(), text: input.value }); } }, input);
  return h.div(null, list, form);
});
export const Picker = component(function Picker(p: { items: Read<readonly { id: string; text: string }[]> }): Node {
  const selectedId = signal<string | null>(null);
  const isSelected = selector(selectedId);
  const items = signal<readonly number[]>([]);
  const el = h.div(null);
  onMount(() => { const w = makeChart(el); effect(() => w.update(items())); return () => w.destroy(); });
  return h.div(null, el,
    svg.svg({ viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' }, svg.path({ d: 'M4 12h16' })),
    h.button({ onclick: () => document.startViewTransition(() => { items.set([1]); flush(); }) }, 'Animate'),
    h.ul(null, each(p.items, { key: (t) => t.id, render: (todo) =>
      h.li({ class: { selected: () => isSelected(todo().id) } },
        h.button({ onclick: () => selectedId.set(todo().id), 'aria-label': () => `Remove ${todo().text}` }, 'x')) })));
});
