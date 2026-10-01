#!/usr/bin/env node
// npm create @jasno <directory> [--jasno <spec>]: scaffolds a jasno app from template/, the minimal working subset of
// the layout in design.md (f). --jasno overrides the jasno dependency (default: this package's version, exactly).
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { jasno: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
if (values.help || positionals.length !== 1) {
  console.log('usage: npm create @jasno <directory>');
  process.exit(values.help ? 0 : 1);
}
const self = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const dir = resolve(positionals[0]);
if (existsSync(dir) && readdirSync(dir).length) {
  console.error(`${dir} exists and is not empty`);
  process.exit(1);
}
// npm package names: lowercase, URL-safe, no leading dot or underscore.
const name = basename(dir).toLowerCase().replace(/[^a-z0-9._~-]+/g, '-').replace(/^[._-]+/, '') || 'jasno-app';

cpSync(fileURLToPath(new URL('./template/', import.meta.url)), dir, { recursive: true });
// npm's packer drops or renames dotfiles such as .gitignore, so the template keeps them with a leading underscore.
for (const f of ['_gitignore', '_gitattributes', '_nvmrc', '_github']) renameSync(join(dir, f), join(dir, `.${f.slice(1)}`));
for (const f of ['package.json', 'index.html']) {
  const p = join(dir, f);
  writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__NAME__', name).replaceAll('__JASNO__', values.jasno ?? self.version));
}

const cd = relative(process.cwd(), dir) || '.';
console.log(`Created ${name} in ${dir}.

Next:
  cd ${cd}
  npm install
  npx playwright install
  npm run dev

Verify in order: npm run check, npm test, npm run e2e, npm run dist && JASNO_E2E=preview npm run e2e.
Commit package-lock.json after the first install, so CI runs npm ci.
AGENTS.md is the guide for coding agents (CLAUDE.md includes it).`);
