import { component, computed, css, each, effect, flush, h, match, onMount, show, signal, type Read } from 'jasno';
import type { ViewProps } from 'jasno/router';
import { subscribe, type Message } from '#api';
import { markSeen, outbox, retry, rooms, send, type Outgoing } from '../state.ts';

css`
  .room, .room .room-body { display: flex; flex-direction: column; gap: 0.75rem; }
  .room .log { list-style: none; margin: 0; padding: 0.5rem; height: 60vh; overflow-y: auto;
    border: 1px solid #ccc; border-radius: 6px; }
  .room .log li { padding: 0.25rem 0; }
  .room .log .pending { opacity: 0.6; }
  .room .log .failed { color: #a00; }
  .room .composer { display: flex; gap: 0.5rem; align-items: end; }
  .room .composer label { flex: 1; display: flex; flex-direction: column; }
`;

export default component(function RoomView(p: ViewProps<'/rooms/:id'>): Node {
  const name = computed(() => rooms().find((r) => r.id === p.params().id)?.name ?? p.params().id);
  effect(() => { document.title = `#${name()} · Chat`; });
  return h.section({ class: 'room' },
    h.h1(null, () => `#${name()}`),
    // Per-room lifecycle: a new id disposes the old body, whose onMount cleanup unsubscribes.
    match(() => p.params().id, (id) => RoomBody({ roomId: id })));
});

type Shown = Message | Outgoing;

const RoomBody = component(function RoomBody(p: { roomId: string }): Node {
  const server = signal<readonly Message[]>([]);
  const shown = computed((): readonly Shown[] => {
    const ids = new Set(server().map((m) => m.id));
    return [...server(), ...outbox().filter((m) => m.roomId === p.roomId && !ids.has(m.id))];
  });

  const list = h.ol({ class: 'log', role: 'log', 'aria-label': 'Messages', tabIndex: 0 },
    each(shown, { key: (m) => m.id, render: (m) => MessageRow({ message: m }) }));
  const toBottom = (): void => { flush(); list.scrollTop = list.scrollHeight; };

  onMount(() => subscribe(p.roomId, (messages) => {
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    server.set(messages);
    markSeen(p.roomId, messages.length);
    if (stick) toBottom();
  }));

  const input = h.textarea({ name: 'text', rows: 2, required: true, autocomplete: 'off',
    onkeydown: (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    } });

  return h.div({ class: 'room-body' },
    list,
    h.form({ class: 'composer', onsubmit: (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      const sent = send(p.roomId, text);
      toBottom();   // my own message always scrolls into view
      return sent;
    } },
    h.label(null, 'Message', input),
    h.button({ type: 'submit' }, 'Send')));
});

const MessageRow = component(function MessageRow(p: { message: Read<Shown> }): Node {
  const status = computed(() => { const m = p.message(); return 'status' in m ? m.status : 'sent'; });
  const row: HTMLLIElement = h.li({ tabIndex: -1, class: { pending: () => status() === 'sending', failed: () => status() === 'failed' } },
    h.strong(null, () => p.message().author), ': ',
    h.span(null, () => p.message().text),
    show(() => status() === 'sending', () => h.small(null, ' Sending…')),
    show(() => status() === 'failed', () => [
      h.small(null, ' Not sent. '),
      h.button({ type: 'button', 'aria-label': () => `Retry sending "${p.message().text}"`,
        onclick: () => {
          const m = p.message();
          if (!('status' in m)) return;
          row.focus();   // the button disappears once the retry starts
          return retry(m);
        } }, 'Retry'),
    ]));
  return row;
});
