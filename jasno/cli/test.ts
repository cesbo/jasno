// jasno test (design.md (e)): node's test runner with jasno's development build and happy-dom, the files
// src/**/*.test.ts unless arguments name others. Every argument goes to node as is (--test-name-pattern=x, --watch).
import { spawn } from 'node:child_process';

export function test(root: string, args: readonly string[]): Promise<number> {
  // ponytail: an argument not starting with - is a file, so a flag's value needs =; parse node's flags if that bites.
  const files = args.some((a) => !a.startsWith('-')) ? [] : ['src/**/*.test.ts'];
  // Under node --test (jasno's own CLI tests) NODE_TEST_CONTEXT would make this runner report to that one.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  const child = spawn(process.execPath, ['--conditions=development', '--import', '@jasno/core/testing/happy-dom', '--test', '--test-isolation=none', ...args, ...files], { cwd: root, env, stdio: 'inherit' });
  return new Promise((resolve) => {
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code === 0 ? 0 : 1));
  });
}
