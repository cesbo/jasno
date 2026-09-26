export interface User { readonly id: string; readonly name: string }
export interface Card { readonly id: string; readonly title: string }
export declare function getUser(id: string, abortSignal: AbortSignal): Promise<User>;
export declare function listUsers(abortSignal: AbortSignal): Promise<readonly User[]>;
export declare function addNote(userId: string, text: string): Promise<void>;
export declare function listNotes(userId: string, abortSignal: AbortSignal): Promise<readonly { readonly id: string; readonly text: string }[]>;
export declare function listCards(abortSignal: AbortSignal): Promise<readonly Card[]>;
export declare function saveTitle(id: string, title: string, abortSignal: AbortSignal): Promise<void>;
export declare function search(q: string, abortSignal: AbortSignal): Promise<readonly string[]>;
export declare function makeChart(el: HTMLElement): { update(data: readonly number[]): void; destroy(): void };
export declare function subscribePresence(roomId: string, cb: (users: readonly string[]) => void): () => void;
