// App-wide state: room summaries, read counts, the outbox of my unconfirmed messages, toasts.
import { signal } from 'jasno';
import { sendMessage, type Message, type Room } from '#api';

export const rooms = signal<readonly Room[]>([]);
/** Per room, how many of its messages I have seen; unread = room.count - seen. */
export const seen = signal<ReadonlyMap<string, number>>(new Map());

export interface Outgoing extends Message { readonly status: 'sending' | 'failed' }
/** My messages the server has not confirmed yet; survives room switches so a failure stays visible. */
export const outbox = signal<readonly Outgoing[]>([]);

export interface Toast { readonly id: number; readonly text: string }
export const toasts = signal<readonly Toast[]>([]);
let toastId = 0;

export function toast(text: string): void {
  toasts.update((a) => [...a, { id: ++toastId, text }]);
}

export function dismiss(id: number): void {
  toasts.update((a) => a.filter((t) => t.id !== id));
}

export function markSeen(roomId: string, count: number): void {
  if (seen().get(roomId) !== count) seen.update((m) => new Map(m).set(roomId, count));
}

export const unread = (room: Room): number => Math.max(0, room.count - (seen().get(room.id) ?? 0));

function put(m: Outgoing): void {
  outbox.update((a) => (a.some((x) => x.id === m.id) ? a.map((x) => (x.id === m.id ? m : x)) : [...a, m]));
}

/** Optimistic send: the message shows at once as 'sending'; on failure it stays as 'failed' with a Retry. */
export async function send(roomId: string, text: string, id: string = crypto.randomUUID()): Promise<void> {
  put({ id, roomId, author: 'You', text, at: Date.now(), status: 'sending' });
  try {
    await sendMessage(roomId, { id, text }, AbortSignal.timeout(10_000));
    // ponytail: the mock echoes the message through subscribe() before resolving; if a real server
    // echoes later, keep a 'sent' entry until the echo arrives or the row blinks out and back.
    outbox.update((a) => a.filter((m) => m.id !== id));
  } catch {
    put({ id, roomId, author: 'You', text, at: Date.now(), status: 'failed' });
    toast(`Message not sent: "${text.slice(0, 40)}". Use Retry.`);
  }
}

export const retry = (m: Outgoing): Promise<void> => send(m.roomId, m.text, m.id);
