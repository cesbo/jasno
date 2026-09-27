// One line per problem (`file:line:col CODE message`), or one JSON object per line with --json (design.md (e)).
import { relative, sep } from 'node:path';

export type Severity = 'error' | 'warn';

export interface Problem {
  code: string;
  severity: Severity;
  message: string;
  hint?: string | undefined;
  file?: string | undefined;
  line?: number | undefined;
  col?: number | undefined;
}

/**
 * Control characters out, so a URL, a browser message or a file name cannot move the cursor or start a fake
 * `file:line:col CODE` line (ADR-34); continuation lines are indented.
 */
export const clean = (s: string): string =>
  s.replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '').replace(/\n/g, '\n  ');

/** 1-based line and column of a UTF-16 offset. */
export function lineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1, start = 0;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) { line++; start = i + 1; }
  return { line, col: offset - start + 1 };
}

export class Reporter {
  readonly problems: Problem[] = [];
  readonly #seen = new Set<string>();
  readonly root: string;
  readonly json: boolean;
  readonly #out: (line: string) => void;
  constructor(root: string, json: boolean, out: (line: string) => void = (l) => console.log(l)) {
    this.root = root;
    this.json = json;
    this.#out = out;
  }

  where(p: Problem): string {
    if (!p.file) return '';
    const f = relative(this.root, p.file).split(sep).join('/');
    return p.line ? `${f}:${p.line}:${p.col ?? 1}` : f;
  }

  /** Prints a problem once (same code, place and message). */
  add(p: Problem): void {
    const key = `${p.code}|${p.file}|${p.line}|${p.col}|${p.message}`;
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    this.problems.push(p);
    if (this.json) this.#out(JSON.stringify({ ...p, file: p.file && this.where({ ...p, line: undefined }) }));
    else this.#out(clean(`${[this.where(p), p.code, p.message].filter(Boolean).join(' ')}${p.hint ? ` hint: ${p.hint}` : ''}`));
  }

  /** Lets already printed problems print again (jasno dev, after a file change). */
  forget(): void { this.#seen.clear(); }

  info(text: string, data: Record<string, unknown> = {}): void {
    this.#out(this.json ? JSON.stringify({ info: text, ...data }) : clean(text));
  }

  /** Exit code: errors fail; warnings fail under --strict or when CI is set (design.md (e) check 7). */
  exitCode(strict = false): number {
    return this.problems.some((p) => p.severity === 'error' || (strict && p.severity === 'warn')) ? 1 : 0;
  }
}
