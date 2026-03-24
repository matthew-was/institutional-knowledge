import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import 'vitest-axe/extend-expect';

// RTL does not auto-cleanup in Vitest; call cleanup after every test.
afterEach(() => {
  cleanup();
});
