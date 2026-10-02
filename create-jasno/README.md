# @jasno/create

Scaffolds a [jasno](https://github.com/cesbo/jasno) app.

```sh
npm create @jasno my-app
cd my-app
npm install
npm run dev
```

The Playwright tests (`npm run e2e`) need the browsers once: `npx playwright install`.

The project comes with TypeScript configs, component tests, Playwright tests, a CI workflow and `AGENTS.md`, the guide for coding agents. `--jasno <spec>` sets the jasno dependency (default: this package's version).

## License

MIT
