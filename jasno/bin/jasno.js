#!/usr/bin/env node
// The CLI is TypeScript run by Node's type stripping (the prototype has no build step); the published package ships
// JavaScript. ExperimentalWarning is silenced as with --disable-warning=ExperimentalWarning (design.md (e) dev).
const nodeListeners = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') for (const l of nodeListeners) l(w); });
const { main } = await import('../cli/main.ts');
process.exitCode = await main(process.argv.slice(2));
