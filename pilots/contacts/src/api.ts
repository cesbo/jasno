// Real backend client. Every function takes an AbortSignal and validates the JSON it gets back.
export interface Person {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly notes: string;
}
export type Draft = Omit<Person, 'id'>;

const isPerson = (x: unknown): x is Person => {
  const o = x as Record<string, unknown> | null;
  return typeof o === 'object' && o !== null
    && ['id', 'name', 'email', 'phone', 'notes'].every((k) => typeof o[k] === 'string');
};

async function call(method: string, path: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const init: RequestInit = { method, signal, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch('/api' + path, init);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function person(x: unknown): Person {
  if (!isPerson(x)) throw new Error('Unexpected response from server');
  return x;
}

/** All people, sorted by name. */
export async function listPeople(signal: AbortSignal): Promise<Person[]> {
  const data = await call('GET', '/people', signal);
  if (!Array.isArray(data)) throw new Error('Unexpected response from server');
  return data.map(person);
}

export async function getPerson(id: string, signal: AbortSignal): Promise<Person | null> {
  const data = await call('GET', '/people/' + encodeURIComponent(id), signal);
  return data === null ? null : person(data);
}

/** Creates or replaces a person; the client-chosen id is the idempotency key. */
export async function savePerson(p: Person, signal: AbortSignal): Promise<Person> {
  return person(await call('PUT', '/people/' + encodeURIComponent(p.id), signal, p));
}

export async function deletePerson(id: string, signal: AbortSignal): Promise<void> {
  await call('DELETE', '/people/' + encodeURIComponent(id), signal);
}
