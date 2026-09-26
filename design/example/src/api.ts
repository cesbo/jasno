// Typed fetch wrappers. Reads take the AbortSignal that jasno hands to loaders; responses are checked at the boundary.
// Import the functions from '#api': in development that resolves to api.mock.ts (package.json "imports").

export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly team: string;
}

export interface Note {
  readonly id: string;
  readonly userId: string;
  readonly text: string;
  readonly createdAt: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}
function isUser(x: unknown): x is User {
  return isRecord(x) && typeof x['id'] === 'string' && typeof x['name'] === 'string'
    && typeof x['email'] === 'string' && typeof x['team'] === 'string';
}
function isNote(x: unknown): x is Note {
  return isRecord(x) && typeof x['id'] === 'string' && typeof x['userId'] === 'string'
    && typeof x['text'] === 'string' && typeof x['createdAt'] === 'string';
}

async function getJson(url: string, abortSignal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal: abortSignal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} failed with ${res.status}`);
  return res.json();
}

function listOf<T>(data: unknown, guard: (x: unknown) => x is T, what: string): T[] {
  if (!Array.isArray(data) || !data.every(guard)) throw new Error(`Unexpected ${what} response`);
  return data;
}

export async function listUsers(abortSignal: AbortSignal): Promise<User[]> {
  return listOf(await getJson('/api/users', abortSignal), isUser, 'users');
}

export async function getUser(id: string, abortSignal: AbortSignal): Promise<User> {
  const data = await getJson(`/api/users/${encodeURIComponent(id)}`, abortSignal);
  if (!isUser(data)) throw new Error('Unexpected user response');
  return data;
}

export async function listNotes(userId: string, abortSignal: AbortSignal): Promise<Note[]> {
  return listOf(await getJson(`/api/users/${encodeURIComponent(userId)}/notes`, abortSignal), isNote, 'notes');
}

export async function addNote(userId: string, text: string): Promise<void> {
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Saving the note failed with ${res.status}`);
}
