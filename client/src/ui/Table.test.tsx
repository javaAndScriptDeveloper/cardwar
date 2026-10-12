import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { c, view } from '../game/fixtures/views';
import { Table, type TableProps } from './Table';

function renderTable(overrides: Partial<TableProps> = {}) {
    const props: TableProps = {
        view: view(),
        opponentName: 'Bob',
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
        expect(screen.getByAltText('Ten of Hearts')).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Seven of Spades, beaten by Eight of Spades' }),
        ).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Seven of Clubs' })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toBe('Defend');
        expect(screen.getAllByAltText('Card back').length).toBe(4 + 1);
    });

    it('enables Take for the defender facing an open attack, and End attack never', () => {
        renderTable({ view: defending });
        expect((screen.getByRole('button', { name: 'Take' }) as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByRole('button', { name: 'End attack' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('enables End attack only once everything on the table is beaten', () => {
        renderTable({
            view: view({ table: [{ attack: c('SIX', 'SPADES'), defence: c('NINE', 'SPADES') }] }),
        });
        expect((screen.getByRole('button', { name: 'End attack' }) as HTMLButtonElement).disabled).toBe(
            false,
        );
        expect((screen.getByRole('button', { name: 'Take' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('disables everything while a move is in flight', () => {
        renderTable({ view: defending, busy: true });
        expect((screen.getByRole('button', { name: 'Take' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('marks playable hand cards and reports taps on hand and table cards', () => {
        const { props } = renderTable({ view: defending });

        const six = screen.getByRole('button', { name: 'Six of Clubs' });
        const nine = screen.getByRole('button', { name: 'Nine of Spades' });
        expect(six.dataset['playable']).toBe('false');
        expect(nine.dataset['playable']).toBe('false'); // spades do not beat clubs
        expect(screen.getByRole('button', { name: 'Ace of Hearts' }).dataset['playable']).toBe('true');

        fireEvent.click(six);
        expect(props.onHandCard).toHaveBeenCalledWith(c('SIX', 'CLUBS'));
        fireEvent.click(screen.getByRole('button', { name: 'Seven of Clubs' }));
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
        expect(screen.getByRole('button', { name: 'Seven of Clubs' }).getAttribute('aria-pressed')).toBe(
            'true',
        );
    });
});
