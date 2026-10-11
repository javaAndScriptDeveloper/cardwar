import { cleanup } from '@testing-library/preact';
import { afterEach } from 'vitest';

// Testing Library only auto-cleans when the runner exposes globals; Vitest here does not, so unmount explicitly.
afterEach(cleanup);
