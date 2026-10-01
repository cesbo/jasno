import { mount } from '@jasno/core';
import { App } from './app.ts';
import { router } from './routes.ts';

(window as unknown as { __router: unknown }).__router = router;
mount(App, document.getElementById('app'));
