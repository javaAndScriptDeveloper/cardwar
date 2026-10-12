import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { c, view } from '../game/fixtures/views';
import { cardLabel, t } from '../i18n';
import { Table, type TableProps } from './Table';

function renderTable(overrides: Partial<TableProps> = {}) {
    const props: TableProps = {
        view: view(),
        you: { name: 'Я' },
        opponent: { name: 'Bob' },
        onHandCard: vi.fn(),
        onTableCard: vi.fn(),
        onTake: vi.fn(),
        onEndAttack: vi.fn(),
        ...overrides,
    };
    return { props, ...render(<Table {...props} />) };
}

const defending = view({
    attacker: 'them',
    phase: 'DEFEND',
    hand: [c('SIX', 'CLUBS'), c('NINE', 'SPADES'), c('ACE', 'HEARTS')],
    opponentHandCount: 4,
    talonCount: 12,
    discardCount: 6,
    table: [{ attack: c('SEVEN', 'SPADES'), defence: c('EIGHT', 'SPADES') }, { attack: c('SEVEN', 'CLUBS') }],
});

describe('Table hand layout', () => {
    const handOrder = (container: Element) =>
        [...container.querySelectorAll('.hand-card')].map((el) => el.getAttribute('data-card'));

    it('draws the hand in the order the pack layouts give, cards unchanged', () => {
        const hand = [c('KING', 'SPADES'), c('SIX', 'CLUBS'), c('JACK', 'SPADES')];
        const { container } = renderTable({
            view: view({ hand }),
            layouts: [{ layout: 'stick_together', cards: ['KING_OF_SPADES', 'JACK_OF_SPADES'] }],
        });

        expect(handOrder(container)).toEqual(['KING_OF_SPADES', 'JACK_OF_SPADES', 'SIX_OF_CLUBS']);
    });

    it('keeps the server order without layouts', () => {
        const hand = [c('KING', 'SPADES'), c('SIX', 'CLUBS'), c('JACK', 'SPADES')];
        const { container } = renderTable({ view: view({ hand }) });

        expect(handOrder(container)).toEqual(['KING_OF_SPADES', 'SIX_OF_CLUBS', 'JACK_OF_SPADES']);
    });
});

describe('Table', () => {
    it('renders a stored view deterministically', () => {
        const { container } = renderTable({ view: defending });
        expect(container.innerHTML).toMatchSnapshot();
    });

    it('shows counts, trump, both table cards of a pair and whose turn it is', () => {
        renderTable({ view: defending });

        expect(screen.getByText('Bob')).toBeTruthy();
        expect(screen.getByTestId('opponent-count').textContent).toBe('4');
        expect(screen.getByTestId('talon-count').textContent).toBe('12');
        expect(screen.getByAltText(cardLabel(c('TEN', 'HEARTS')))).toBeTruthy();
        expect(
            screen.getByRole('button', {
                name: t('duel.beatenBy', {
                    attack: cardLabel(c('SEVEN', 'SPADES')),
                    defence: cardLabel(c('EIGHT', 'SPADES')),
                }),
            }),
        ).toBeTruthy();
        expect(screen.getByRole('button', { name: cardLabel(c('SEVEN', 'CLUBS')) })).toBeTruthy();
        expect(screen.getByRole('status').getAttribute('data-state')).toBe('defend');
        expect(screen.getAllByAltText(t('card.back')).length).toBe(4 + 1);
    });

    it('shows the pot of a staked duel next to the trump, and none for a friendly one', () => {
        const { unmount } = renderTable({ view: view({ stake: 500 }) });
        expect(screen.getByTestId('pot').getAttribute('data-pot')).toBe('1000');
        unmount();

        renderTable({ view: view({ stake: 0 }) });
        expect(screen.queryByTestId('pot')).toBeNull();
    });

    it('enables Take for the defender facing an open attack, and End attack never', () => {
        renderTable({ view: defending });
        expect((screen.getByTestId('take') as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByTestId('end-attack') as HTMLButtonElement).disabled).toBe(true);
    });

    it('enables End attack only once everything on the table is beaten', () => {
        renderTable({
            view: view({ table: [{ attack: c('SIX', 'SPADES'), defence: c('NINE', 'SPADES') }] }),
        });
        expect((screen.getByTestId('end-attack') as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByTestId('take') as HTMLButtonElement).disabled).toBe(true);
    });

    it('disables everything while a move is in flight', () => {
        renderTable({ view: defending, busy: true });
        expect((screen.getByTestId('take') as HTMLButtonElement).disabled).toBe(true);
    });

    it('marks playable hand cards and reports taps on hand and table cards', () => {
        const { props } = renderTable({ view: defending });

        const hand = (id: string) => document.querySelector(`.hand-card[data-card="${id}"]`) as HTMLElement;
        const six = hand('SIX_OF_CLUBS');
        expect(six.dataset['playable']).toBe('false');
        expect(hand('NINE_OF_SPADES').dataset['playable']).toBe('false'); // spades do not beat clubs
        expect(hand('ACE_OF_HEARTS').dataset['playable']).toBe('true');

        fireEvent.click(six);
        expect(props.onHandCard).toHaveBeenCalledWith(c('SIX', 'CLUBS'));
        fireEvent.click(document.querySelector('.pair[data-attack="SEVEN_OF_CLUBS"]') as HTMLElement);
        expect(props.onTableCard).toHaveBeenCalledWith(c('SEVEN', 'CLUBS'));
    });

    it('exposes machine-readable state for tests', () => {
        renderTable({ view: defending });
        expect(screen.getByRole('status').getAttribute('data-state')).toBe('defend');
        const pairs = document.querySelectorAll('.pair');
        expect(pairs[0]?.getAttribute('data-attack')).toBe('SEVEN_OF_SPADES');
        expect(pairs[0]?.getAttribute('data-defence')).toBe('EIGHT_OF_SPADES');
        expect(pairs[1]?.getAttribute('data-defence')).toBeNull();
        expect(screen.getByTestId('trump').getAttribute('data-card')).toBe('TEN_OF_HEARTS');
        expect(document.querySelector('.hand-card')?.getAttribute('data-card')).toBe('SIX_OF_CLUBS');
        expect(screen.getByTestId('take')).toBeTruthy();
        expect(screen.getByTestId('end-attack')).toBeTruthy();
    });

    it('highlights the selected defence target', () => {
        renderTable({ view: defending, selectedTarget: c('SEVEN', 'CLUBS') });
        expect(
            (document.querySelector('.pair[data-attack="SEVEN_OF_CLUBS"]') as HTMLElement).getAttribute(
                'aria-pressed',
            ),
        ).toBe('true');
    });

    describe('swipe to play', () => {
        function drag(el: Element, dx: number, dy: number) {
            fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 300, isPrimary: true });
            fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx / 2, clientY: 300 + dy / 2 });
            fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx, clientY: 300 + dy });
            fireEvent.pointerUp(el, { pointerId: 1, clientX: 100 + dx, clientY: 300 + dy });
            // Browsers send a click after pointerup on the same element, drag or not.
            fireEvent.click(el);
        }
        const firstCard = () => document.querySelector('.hand-card') as HTMLElement;

        it('plays a card on an upward swipe', () => {
            const { props } = renderTable({ swipe: true });
            drag(firstCard(), 0, -80);
            expect(props.onHandCard).toHaveBeenCalledTimes(1);
            expect(props.onHandCard).toHaveBeenCalledWith(c('SIX', 'CLUBS'));
        });

        it('a tap still plays exactly once', () => {
            const { props } = renderTable({ swipe: true });
            drag(firstCard(), 0, 0);
            expect(props.onHandCard).toHaveBeenCalledTimes(1);
        });

        it('short drag is a no-op', () => {
            const { props } = renderTable({ swipe: true });
            drag(firstCard(), 0, -20);
            expect(props.onHandCard).not.toHaveBeenCalled();
        });

        it('horizontal drag is a no-op', () => {
            const { props } = renderTable({ swipe: true });
            drag(firstCard(), 90, -10);
            expect(props.onHandCard).not.toHaveBeenCalled();
        });

        it('does not swipe when the setting is off, but still taps', () => {
            const { props } = renderTable({ swipe: false });
            drag(firstCard(), 0, -80);
            expect(props.onHandCard).not.toHaveBeenCalled();
            drag(firstCard(), 0, 0);
            expect(props.onHandCard).toHaveBeenCalledTimes(1);
        });

        it('ignores drags while a move is in flight', () => {
            const { props } = renderTable({ swipe: true, busy: true });
            drag(firstCard(), 0, -80);
            expect(props.onHandCard).not.toHaveBeenCalled();
        });
    });

    describe('move clock', () => {
        const soon = (s: number) => new Date(Date.now() + s * 1000).toISOString();

        it('shows the countdown for whoever is to move', () => {
            const { unmount } = renderTable({ view: view({ deadline: soon(25), toMove: 'me' }) });
            expect(screen.getByTestId('move-timer').getAttribute('data-to-move')).toBe('you');
            const seconds = Number(screen.getByTestId('move-timer').getAttribute('data-seconds'));
            expect(seconds).toBeGreaterThanOrEqual(24);
            expect(seconds).toBeLessThanOrEqual(25);
            unmount();

            renderTable({ view: view({ deadline: soon(25), toMove: 'them' }) });
            expect(screen.getByTestId('move-timer').getAttribute('data-to-move')).toBe('opponent');
        });

        it('has no countdown without a deadline', () => {
            renderTable({ view: view() });
            expect(screen.queryByTestId('move-timer')).toBeNull();
        });

        it('passes your clock warnings on', async () => {
            const onClockWarning = vi.fn();
            renderTable({ view: view({ deadline: soon(4), toMove: 'me' }), onClockWarning });
            expect(onClockWarning).toHaveBeenCalledWith('five');
        });

        it('shows the strikes next to each avatar', () => {
            renderTable({ view: view({ strikes: { you: 1, opponent: 2 } }) });

            expect(screen.getByTestId('strikes-you').getAttribute('data-strikes')).toBe('1');
            expect(screen.getByTestId('strikes-opponent').getAttribute('data-strikes')).toBe('2');
            expect(screen.getByTestId('strikes-opponent').querySelectorAll('.strike.on').length).toBe(2);
        });

        it('shows no strikes for a server without the clock', () => {
            renderTable({ view: view() });
            expect(screen.queryByTestId('strikes-you')).toBeNull();
        });
    });

    it('shows both avatars', () => {
        renderTable({ you: { name: 'Я' }, opponent: { name: 'Оля Коваль' } });
        expect(screen.getByTestId('opponent-avatar').textContent).toBe('ОК');
        expect(screen.getByTestId('you-avatar').textContent).toBe('Я');
    });
});
