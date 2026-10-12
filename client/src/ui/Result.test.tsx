import { act, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { Result, type ResultProps } from './Result';

function renderResult(overrides: Partial<ResultProps> = {}) {
    const props: ResultProps = {
        result: { result: 'WON', reason: 'OPPONENT_OUT' },
        coins: 100,
        stake: 100,
        opponent: { name: 'Оля' },
        onHome: vi.fn(),
        ...overrides,
    };
    return { props, ...render(<Result {...props} />) };
}

describe('Result', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('names the outcome, the opponent and the record between you', () => {
        renderResult({ record: { won: 3, lost: 1 } });

        expect(screen.getByTestId('result').getAttribute('data-result')).toBe('WON');
        expect(screen.getByRole('heading', { name: t('duel.result.WON') })).toBeTruthy();
        expect(screen.getByTestId('result-opponent').textContent).toContain('Оля');
        expect(screen.getByTestId('result-record').textContent).toBe('3:1');
    });

    it('counts the coins up to the delta instead of printing it at once', () => {
        renderResult({ coins: 500 });

        const delta = () => screen.getByTestId('coin-delta');
        expect(delta().getAttribute('data-delta')).toBe('500');
        const shown = () => Number(delta().querySelector('[data-amount]')?.getAttribute('data-amount'));
        expect(shown()).toBeLessThan(500);
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(shown()).toBe(500);
    });

    it('offers a rematch at the same stake, or the accept button once the opponent already asked', () => {
        const onRematch = vi.fn();
        const onAccept = vi.fn();
        const { unmount } = renderResult({ rematch: { busy: false, onRematch } });

        fireEvent.click(screen.getByTestId('rematch'));
        expect(onRematch).toHaveBeenCalled();
        unmount();

        renderResult({
            rematch: { busy: false, onRematch },
            incoming: { stake: 100, busy: false, onAccept },
        });
        // Two invites between the same two people would race each other: accepting theirs is the rematch.
        expect(screen.queryByTestId('rematch')).toBeNull();
        expect(screen.getByTestId('rematch-incoming').getAttribute('data-stake')).toBe('100');
        fireEvent.click(screen.getByTestId('accept-rematch'));
        expect(onAccept).toHaveBeenCalled();
    });

    it('has no rematch button when the opponent cannot be challenged, and always a way home', () => {
        const { props } = renderResult({ result: { result: 'LOST', reason: 'FORFEIT' }, coins: -100 });

        expect(screen.queryByTestId('rematch')).toBeNull();
        expect(screen.getByText(t('duel.explainForfeit.LOST'))).toBeTruthy();
        fireEvent.click(screen.getByTestId('back-to-lobby'));
        expect(props.onHome).toHaveBeenCalled();
    });

    it('renders whatever progress lines it is given below the coins', () => {
        renderResult({ progress: <p data-testid="progress-lines">+30 XP</p> });

        expect(screen.getByTestId('progress-lines')).toBeTruthy();
    });
});
