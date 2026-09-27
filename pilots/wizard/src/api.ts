export type Plan = 'free' | 'pro';

export interface SignupInput {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly username: string;
  readonly country: string;
  readonly plan: Plan;
  readonly newsletter: boolean;
}

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

function isAccount(v: unknown): v is Account {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return typeof a['id'] === 'string' && typeof a['name'] === 'string' && typeof a['email'] === 'string';
}

export async function createAccount(input: SignupInput, signal: AbortSignal): Promise<Account> {
  const res = await fetch('/api/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { message?: unknown } | null)?.message;
    throw new Error(typeof message === 'string' ? message : `Sign-up failed (${res.status}). Try again.`);
  }
  if (!isAccount(body)) throw new Error('The server sent an unexpected answer. Try again.');
  return body;
}
