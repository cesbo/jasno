import { JasnoError } from './diag.ts';

throw new JasnoError('TESTING_REQUIRES_DEV_BUILD', '@jasno/core/testing needs the development build of jasno.',
  'Run node with --conditions=development (npm test does).');
