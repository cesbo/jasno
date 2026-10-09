// node scripts/test-template.mjs: scaffolds an app with create-jasno against the packed jasno tarball and runs every
// rung the template promises with its own scripts and config: npm run check -- --strict, npm test, npm run e2e
// (Chromium, Firefox, WebKit under jasno dev) and npm run dist && JASNO_E2E=preview npm run e2e. Also checks that
// create-jasno packs every template file, shares jasno's version, and has an AGENTS.md that points to the guide the
// installed package ships.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CREATE = join(ROOT, '..', 'create-jasno');
const run = (cmd, args, cwd, env = {}) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
};
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));

const create = JSON.parse(readFileSync(join(CREATE, 'package.json'), 'utf8'));
const jasno = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
if (create.version !== jasno.version) throw new Error(`create-jasno ${create.version} but jasno ${jasno.version}`);
const GUIDE = 'node_modules/@jasno/core/AGENTS.md';
if (!readFileSync(join(CREATE, 'template', 'AGENTS.md'), 'utf8').includes(GUIDE)) throw new Error(`create-jasno/template/AGENTS.md does not point to ${GUIDE}`);
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: CREATE, encoding: 'utf8' }));
const inPack = new Set(packed.files.map((f) => f.path));
const missing = [...walk(join(CREATE, 'template')).map((f) => relative(CREATE, f)), 'README.md', 'LICENSE'].filter((f) => !inPack.has(f));
if (missing.length) throw new Error(`create-jasno does not pack: ${missing.join(', ')}`);
if (readFileSync(join(CREATE, 'LICENSE'), 'utf8') !== readFileSync(join(ROOT, '..', 'LICENSE'), 'utf8')) throw new Error('create-jasno/LICENSE differs from LICENSE');

run('node', ['scripts/build-package.mjs', '--pack'], ROOT);
const tgz = join(ROOT, 'release', `jasno-core-${jasno.version}.tgz`);
const tmp = mkdtempSync(join(tmpdir(), 'jasno-template-'));
try {
  mkdirSync(join(tmp, 'my-app', '.git'), { recursive: true }); // a target with only .git counts as empty
  run('node', [join(CREATE, 'index.js'), 'my-app', '--jasno', `file:${tgz}`], tmp);
  const app = join(tmp, 'my-app');
  for (const f of ['.gitignore', '.gitattributes', '.nvmrc', '.github/workflows/ci.yml']) readFileSync(join(app, f));
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], app);
  readFileSync(join(app, GUIDE));
  run('npm', ['run', 'check', '--', '--strict'], app);
  run('npm', ['test'], app);
  run('npm', ['run', 'e2e'], app, { CI: '1' });
  run('npm', ['run', 'dist'], app);
  run('npm', ['run', 'e2e'], app, { CI: '1', JASNO_E2E: 'preview' });
  console.log('\ntemplate check passed');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
