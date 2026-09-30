// node scripts/test-package.mjs: packs jasno and runs the design example against the installed tarball, the release
// check design.md (f) asks for. A copy of design/example depends on file:<tarball> (so jasno lands in node_modules as
// JavaScript, not a symlink to the sources) and passes: the tarball file list, jasno check --strict, jasno explain
// printing an installed repair guide, tsc without
// skipLibCheck (the shipped .d.ts), npm test, and the browser probe under jasno dev and on jasno dist + preview in
// Chromium, Firefox and WebKit, all with the installed CLI.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXAMPLE = join(ROOT, '..', 'design', 'example');
const run = (cmd, args, cwd, env = {}) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
};

run('node', ['scripts/build-package.mjs', '--pack'], ROOT);
const { version } = JSON.parse(readFileSync(join(ROOT, 'release', 'package.json'), 'utf8'));
const tgz = join(ROOT, 'release', `jasno-${version}.tgz`);

const files = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' }).trim().split('\n');
const stray = files.filter((f) => /\.ts$/.test(f) && !/\.d\.ts$/.test(f) || /test/.test(f.replace('testing', '')));
if (stray.length) throw new Error(`the tarball ships sources or tests: ${stray.join(', ')}`);
console.log(`tarball: ${files.length} files, no sources or tests`);

const dir = mkdtempSync(join(tmpdir(), 'jasno-release-'));
try {
  cpSync(EXAMPLE, dir, { recursive: true, filter: (p) => !/(^|\/)(node_modules|dist|\.jasno|test-results)(\/|$)/.test(relative(EXAMPLE, p)) });
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  pkg.dependencies.jasno = `file:${tgz}`;
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  for (const f of ['tsconfig.json', 'tsconfig.test.json']) {
    const ts = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    ts.include = ts.include.filter((p) => !p.endsWith('jasno.d.ts')); // the types now come from the package
    writeFileSync(join(dir, f), JSON.stringify(ts, null, 2));
  }
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], dir);
  const bin = join(dir, 'node_modules', '.bin', 'jasno');
  run(bin, ['check', '--strict'], dir);
  const guide = execFileSync(bin, ['explain', 'FOCUS_LOST'], { cwd: dir, encoding: 'utf8' });
  if (!guide.startsWith('# FOCUS_LOST\n')) throw new Error(`the installed jasno explain did not print the repair guide:\n${guide.slice(0, 300)}`);
  console.log('jasno explain prints the installed repair guide');
  run(join(dir, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.test.json', '--skipLibCheck', 'false'], dir);
  run('npm', ['test'], dir);
  const probe = join(ROOT, 'test', 'browser', 'example.mjs');
  run('node', [probe], ROOT, { EXAMPLE_DIR: dir, JASNO_BIN: bin });
  run('node', [probe, 'preview'], ROOT, { EXAMPLE_DIR: dir, JASNO_BIN: bin });
  console.log(`\nrelease check passed: jasno-${version}.tgz`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
