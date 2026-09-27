export type Column = 'todo' | 'doing' | 'done';
export interface Card { readonly id: string; readonly title: string; readonly column: Column }

const columns: readonly unknown[] = ['todo', 'doing', 'done'] satisfies Column[];

function toCard(data: unknown): Card {
  const c = (data ?? {}) as { id?: unknown; title?: unknown; column?: unknown };
  if (typeof c.id !== 'string' || typeof c.title !== 'string' || !columns.includes(c.column)) throw new Error('Unexpected card from the server');
  return { id: c.id, title: c.title, column: c.column as Column };
}

async function request(method: string, path: string, body: unknown, abortSignal: AbortSignal): Promise<unknown> {
  const res = await fetch(`/api/cards${path}`, {
    method, signal: abortSignal, headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`${method} /api/cards${path} failed: ${res.status}`);
  return res.status === 204 ? null : ((await res.json()) as unknown);
}

export async function listCards(abortSignal: AbortSignal): Promise<Card[]> {
  const data = await request('GET', '', undefined, abortSignal);
  if (!Array.isArray(data)) throw new Error('Unexpected card list from the server');
  return data.map(toCard);
}

/** The client-made id is the idempotency key: a retried create cannot duplicate the card. */
export async function createCard(card: Card, abortSignal: AbortSignal): Promise<Card> {
  return toCard(await request('POST', '', card, abortSignal));
}

/** Saves the whole card (title and column), so queued saves of one card never mix fields. */
export async function saveCard(card: Card, abortSignal: AbortSignal): Promise<Card> {
  return toCard(await request('PUT', `/${encodeURIComponent(card.id)}`, card, abortSignal));
}

export async function deleteCard(id: string, abortSignal: AbortSignal): Promise<void> {
  await request('DELETE', `/${encodeURIComponent(id)}`, undefined, abortSignal);
}
