// In-memory backend for jasno dev and npm test. Same types as ./api.ts; the extra exports are test hooks.
import type * as Api from './api.ts';

type Message = Api.Message;
const ROOMS = ['general', 'random', 'help'];
const PEOPLE = ['Ada', 'Grace', 'Linus'];
const LINES = ['Anyone around?', 'Deploy is green.', 'Lunch?', 'Looks good to me.', 'Can someone review my PR?'];
export const TICK_MS = 5000;

let rooms = new Map<string, readonly Message[]>();
const roomSubs = new Map<string, Set<(m: readonly Message[]) => void>>();
const listSubs = new Set<(r: readonly Api.Room[]) => void>();
let offline = false;
let tick = 0;
let timer: ReturnType<typeof setInterval> | undefined;

const msg = (roomId: string, author: string, text: string, i = 0): Message =>
  ({ id: crypto.randomUUID(), roomId, author, text, at: Date.now() - i * 60_000 });

/** Test hook: back to the seed data (general has enough history to scroll). */
export function reset(): void {
  offline = false;
  tick = 0;
  rooms = new Map(ROOMS.map((id) => [id, id === 'general'
    ? Array.from({ length: 30 }, (_, i) => msg(id, PEOPLE[i % 3] ?? 'Ada', `Message ${i + 1}`, 30 - i))
    : [msg(id, 'Grace', `Welcome to #${id}`, 2), msg(id, 'Ada', 'Hi!', 1)]]));
}
reset();

/** Test hook: sendMessage fails while offline (the browser's offline mode counts too). */
export function setOffline(value: boolean): void { offline = value; }

/** Test hook: how many live subscriptions a room has. */
export function subscriberCount(roomId: string): number { return roomSubs.get(roomId)?.size ?? 0; }

const summaries = (): Api.Room[] =>
  [...rooms].map(([id, list]) => ({ id, name: id, count: list.length }));

/** Test hook (and the timer): a message from someone else arrives. */
export function deliver(roomId: string, author: string, text: string): Message {
  return append(msg(roomId, author, text));
}

function append(m: Message): Message {
  const list = [...(rooms.get(m.roomId) ?? []), m];
  rooms.set(m.roomId, list);
  for (const cb of roomSubs.get(m.roomId) ?? []) cb(list);
  for (const cb of listSubs) cb(summaries());
  return m;
}

// Simulated people post round-robin across rooms while anyone is subscribed.
function syncTimer(): void {
  const active = listSubs.size > 0 || [...roomSubs.values()].some((s) => s.size > 0);
  if (active && timer === undefined) {
    timer = setInterval(() => {
      const n = tick++;
      deliver(ROOMS[n % ROOMS.length] ?? 'general', PEOPLE[n % PEOPLE.length] ?? 'Ada', LINES[n % LINES.length] ?? '…');
    }, TICK_MS);
  } else if (!active && timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

export const subscribeRooms: typeof Api.subscribeRooms = (cb) => {
  listSubs.add(cb);
  syncTimer();
  cb(summaries());
  return () => { listSubs.delete(cb); syncTimer(); };
};

export const subscribe: typeof Api.subscribe = (roomId, cb) => {
  const subs = roomSubs.get(roomId) ?? new Set();
  roomSubs.set(roomId, subs);
  subs.add(cb);
  syncTimer();
  cb(rooms.get(roomId) ?? []);
  return () => { subs.delete(cb); syncTimer(); };
};

export const sendMessage: typeof Api.sendMessage = async (roomId, draft, abortSignal) => {
  await new Promise<void>((ok, fail) => {
    const t = setTimeout(ok, 300);
    abortSignal.addEventListener('abort', () => { clearTimeout(t); fail(abortSignal.reason); });
  });
  if (offline || !navigator.onLine) throw new Error('Network error');
  const list = rooms.get(roomId);
  if (!list) throw new Error(`No room ${roomId}`);
  const known = list.find((m) => m.id === draft.id);   // idempotent: a retry of a saved message
  if (known) return known;
  return append({ id: draft.id, roomId, author: 'You', text: draft.text, at: Date.now() });
};
