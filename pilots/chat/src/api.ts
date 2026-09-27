// Real backend client. No backend exists yet: jasno dev and npm test use ./api.mock.ts (package.json "#api").
// ponytail: EventSource delivers the first snapshot asynchronously (the mock's is synchronous); both are fine for RoomBody.

export interface Room { readonly id: string; readonly name: string; readonly count: number }
export interface Message {
  readonly id: string;
  readonly roomId: string;
  readonly author: string;
  readonly text: string;
  readonly at: number;
}
export type Unsubscribe = () => void;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isRoom = (v: unknown): v is Room =>
  isObj(v) && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.count === 'number';
const isMessage = (v: unknown): v is Message =>
  isObj(v) && typeof v.id === 'string' && typeof v.roomId === 'string' && typeof v.author === 'string'
  && typeof v.text === 'string' && typeof v.at === 'number';

function stream<T>(url: string, valid: (v: unknown) => boolean, cb: (items: readonly T[]) => void): Unsubscribe {
  const source = new EventSource(url);
  source.onmessage = (e: MessageEvent<string>) => {
    const data: unknown = JSON.parse(e.data);
    if (Array.isArray(data) && data.every(valid)) cb(data as T[]);
  };
  return () => source.close();
}

/** Room summaries: called with the current list, then again whenever a room gets a message. */
export function subscribeRooms(cb: (rooms: readonly Room[]) => void): Unsubscribe {
  return stream<Room>('/api/rooms', isRoom, cb);
}

/** All messages of a room: called with the current messages, then again on each new message. */
export function subscribe(roomId: string, cb: (messages: readonly Message[]) => void): Unsubscribe {
  return stream<Message>(`/api/rooms/${encodeURIComponent(roomId)}/messages`, isMessage, cb);
}

/** Posts a message; draft.id is the idempotency key, so a retry cannot duplicate it. */
export async function sendMessage(roomId: string, draft: { readonly id: string; readonly text: string },
  abortSignal: AbortSignal): Promise<Message> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft), signal: abortSignal,
  });
  if (!res.ok) throw new Error(`Send failed: HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!isMessage(data)) throw new Error('Send failed: bad response');
  return data;
}
