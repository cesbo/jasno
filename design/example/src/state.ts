import { signal } from '@jasno/core';

// App-wide state: the notes live in this browser (localStorage), the people come from the server (#api). Views read
// the signal; every change goes through the functions here, so the screen and the storage cannot drift apart.

export interface Note {
  readonly id: string;
  readonly userId: string;
  readonly text: string;
  readonly createdAt: string;
}

export const NOTES_KEY = 'jasno-example:notes';

function isNote(x: unknown): x is Note {
  if (typeof x !== 'object' || x === null) return false;
  const n = x as Record<string, unknown>;
  return typeof n['id'] === 'string' && typeof n['userId'] === 'string' && typeof n['text'] === 'string'
    && typeof n['createdAt'] === 'string';
}

/** What is stored: [] when nothing is, the JSON is broken or storage is blocked; entries of another shape are dropped. */
function load(): readonly Note[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(isNote) : [];
  } catch {
    return [];
  }
}

export const notes = signal(load());

/**
 * Stores first, then shows. It builds on what is stored, so a note another tab just added is kept even before its
 * storage event arrives. When storage refuses (full, blocked) it throws and nothing changes: the form keeps the draft.
 */
export function addNote(userId: string, text: string): void {
  const next = [...load(), { id: crypto.randomUUID(), userId, text, createdAt: new Date().toISOString() }];
  localStorage.setItem(NOTES_KEY, JSON.stringify(next));
  notes.set(next);
}

/** Shows what other tabs store (the event never fires in the tab that wrote). Call it from App's onMount. */
export function syncNotes(): () => void {
  const onStorage = (e: StorageEvent): void => {
    if (e.key === NOTES_KEY || e.key === null) notes.set(load()); // null: another tab cleared the storage
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
