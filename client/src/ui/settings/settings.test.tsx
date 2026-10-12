import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, settings } from '../../state/settings';
import { Settings } from './Settings';

describe('Settings', () => {
    beforeEach(() => {
        settings.value = DEFAULT_SETTINGS;
    });

    it('shows one toggle per setting reflecting the current value', () => {
        settings.value = { ...DEFAULT_SETTINGS, haptics: false };

        render(<Settings />);

        expect((screen.getByTestId('setting-sound') as HTMLInputElement).checked).toBe(true);
        expect((screen.getByTestId('setting-haptics') as HTMLInputElement).checked).toBe(false);
        expect(screen.getByTestId('setting-swipe')).toBeTruthy();
        expect(screen.getByTestId('setting-music')).toBeTruthy();
        expect(screen.getByTestId('setting-reducedMotion')).toBeTruthy();
    });

    it('flips the setting when toggled', () => {
        render(<Settings />);

        fireEvent.click(screen.getByTestId('setting-sound'));

        expect(settings.value.sound).toBe(false);
        expect((screen.getByTestId('setting-sound') as HTMLInputElement).checked).toBe(false);
    });
});
