# @jasno/create

Scaffolds a [jasno](https://github.com/cesbo/jasno) app.

```sh
npm create @jasno my-app
cd my-app
npm install
npm run dev
```

The project comes with TypeScript configs, component tests, Playwright tests, a CI workflow and `AGENTS.md`, the guide for coding agents.

The new project depends on `@jasno/core` at the same version as `@jasno/create`. For another version, a tag or a local build, pass any npm dependency spec with `--jasno` (npm forwards options only after `--`):

```sh
npm create @jasno my-app -- --jasno file:../jasno-core-0.1.5.tgz
```
