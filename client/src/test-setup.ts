import { cleanup } from '@testing-library/preact';
import { afterEach } from 'vitest';

// Testing Library only auto-cleans when the runner exposes globals; Vitest here does not, so unmount explicitly.
afterEach(cleanup);

// jsdom has no Web Animations API; a configurable placeholder lets tests install a fake per element.
if (!('animate' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'animate', {
        value: undefined,
        writable: true,
        configurable: true,
    });
}
