import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { resolveTelegram } from '../telegram/webapp';
import { App } from './App';

describe('App shell', () => {
    it('says when it is running on the browser dev shim', () => {
        render(<App telegram={resolveTelegram({})} />);

        expect(screen.getByRole('heading', { name: 'Cardwar' })).toBeTruthy();
        expect(screen.getByText(/dev shim/i)).toBeTruthy();
    });
});
