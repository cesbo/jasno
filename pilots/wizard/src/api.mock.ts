import type * as Api from './api.ts';

const delay = (ms: number, signal: AbortSignal) => new Promise<void>((ok, fail) => {
  const t = setTimeout(ok, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); fail(signal.reason); });
});

// Username "taken" fails with a conflict, like a real backend would.
export const createAccount: typeof Api.createAccount = async (input, signal) => {
  await delay(600, signal);
  if (input.username === 'taken') throw new Error('That username is already taken. Go back to Profile and choose another.');
  return { id: crypto.randomUUID(), name: input.name, email: input.email };
};
