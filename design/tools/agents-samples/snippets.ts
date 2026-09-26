// AGENTS.md reactive rule, components, markup, lists, async, context/cleanup snippets.
import { catchError, component, computed, createContext, css, each, effect, h, linkedSignal, match, mount, onMount, provide, resource, show, signal, svg, untracked, useContext, type Child, type Read } from 'jasno';
import { getUser } from './api.ts';

css`.card { .title { font-weight: 600; } }`;

export const Profile = component(function Profile(p: { id: Read<string>; userId: Read<string>; sub?: Read<string> | undefined; panel: () => Child }): Node {
  const user = resource({ params: () => p.id(), loader: ({ params, abortSignal }) => getUser(params, abortSignal) });
  const draft = linkedSignal({ source: p.userId, computation: () => '' });
  const seed = untracked(p.id);
  const items = signal<readonly string[]>([]);
  items.update((a) => [...a, 'x']);
  const count = signal(0);
  const g = signal('4px');
  const Retry = component(function Retry(r: { reset: () => void }): Node { return h.button({ onclick: r.reset }, 'Retry'); });
  const Chart = component(function Chart(): Node { return h.div(null); });
  return h.div({ class: 'card', style: { marginTop: '4px', '--gap': () => g() } },
    show(() => user.hasValue() && user.value(), (u) => h.h2(null, () => u().name), () => h.p({ role: 'status' }, 'Loading')),
    h.p(null, count), h.p(null, draft, seed),
    svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: 'M4 12h16' })),
    catchError(() => Chart(), (_err, reset) => Retry({ reset })),
    match(() => (count() > 0 ? 'some' : 'none'), (k) => h.span(null, k)),
    each(items, { key: (t) => t, render: (item, index, key) => h.li(null, () => item(), index, key) }),
    p.panel(),
  );
});

export const Toast = createContext<(msg: string) => void>('Toast');
declare function fit(): void;
declare function tick(): void;
declare function notify(msg: string): void;
export const Page = component(function Page(): Node {
  const toast = useContext(Toast);        // child setup; keep the const
  const count = signal(0);
  onMount(({ abortSignal }) => {
    window.addEventListener('resize', fit, { signal: abortSignal });
    const t = setInterval(tick, 1000); return () => clearInterval(t);
  });
  effect(() => { document.title = `${count()} items`; });
  return h.button({ onclick: () => toast('hi') }, 'Hi');
});
export const Shell = component(function Shell(): Node {
  return provide(Toast, notify, () => Page());   // parent
});
export const doubled = computed(() => 2);
export const App = component(function App(): Node { return h.main(null, Shell()); });
mount(App, document.getElementById('app'));
