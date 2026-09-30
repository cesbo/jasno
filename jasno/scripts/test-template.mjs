// node scripts/test-template.mjs: scaffolds an app with create-jasno against the packed jasno tarball and runs every
// rung the template promises with its own scripts and config: npm run check -- --strict, npm test, npm run e2e
// (Chromium, Firefox, WebKit under jasno dev) and npm run dist && JASNO_E2E=preview npm run e2e. Also checks that
// create-jasno packs every template file, shares jasno's version, and ships AGENTS.md as design/AGENTS.md verbatim.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
const agents = readFileSync(join(CREATE, 'template', 'AGENTS.md'), 'utf8');
const design = readFileSync(join(ROOT, '..', 'design', 'AGENTS.md'), 'utf8');
if (agents !== `<!-- jasno:begin -->\n${design}<!-- jasno:end -->\n`) throw new Error('create-jasno/template/AGENTS.md differs from design/AGENTS.md');
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: CREATE, encoding: 'utf8' }));
const inPack = new Set(packed.files.map((f) => f.path));
const missing = walk(join(CREATE, 'template')).map((f) => relative(CREATE, f)).filter((f) => !inPack.has(f));
if (missing.length) throw new Error(`create-jasno does not pack: ${missing.join(', ')}`);

run('node', ['scripts/build-package.mjs', '--pack'], ROOT);
const tgz = join(ROOT, 'release', `jasno-${jasno.version}.tgz`);
const tmp = mkdtempSync(join(tmpdir(), 'jasno-template-'));
try {
  run('node', [join(CREATE, 'index.js'), 'my-app', '--jasno', `file:${tgz}`], tmp);
  const app = join(tmp, 'my-app');
  for (const f of ['.gitignore', '.gitattributes', '.nvmrc', '.github/workflows/ci.yml', 'CLAUDE.md']) readFileSync(join(app, f));
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], app);
  run('npm', ['run', 'check', '--', '--strict'], app);
  run('npm', ['test'], app);
  run('npm', ['run', 'e2e'], app, { CI: '1' });
  run('npm', ['run', 'dist'], app);
  run('npm', ['run', 'e2e'], app, { CI: '1', JASNO_E2E: 'preview' });
  console.log('\ntemplate check passed');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
