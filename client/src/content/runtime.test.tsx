import { render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableEvent } from '../game/diff';
import { c } from '../game/fixtures/views';
import { CARD_IDS } from './schema';
import { PackBubbles, PackRuntime, type RuntimeDeps } from './runtime';
import type { PackManifest, Rule } from './types';

const KING_S = c('KING', 'SPADES');
const JACK_S = c('JACK', 'SPADES');
const SIX_C = c('SIX', 'CLUBS');
const ACE_H = c('ACE', 'HEARTS');

function pack(rules: Rule[]): PackManifest {
    return {
        id: 'demo',
        version: 1,
        type: 'DECK',
        name: { uk: 'Демо' },
        cards: {
            ...Object.fromEntries(CARD_IDS.map((id) => [id, { image: `cards/${id}.svg` }])),
            ACE_OF_HEARTS: { image: 'a.svg', tags: ['banker'] },
        },
        sounds: { boom: 'sounds/boom.wav' },
        animations: { rain: { kind: 'css', className: 'fx-rain', durationMs: 900 } },
        rules,
    };
}

const sticky: Rule = {
    id: 'sticky',
    on: 'hand_changed',
    if: { handHas: ['KING_OF_SPADES', 'JACK_OF_SPADES'] },
    do: [{ layout: 'stick_together', cards: ['KING_OF_SPADES', 'JACK_OF_SPADES'] }],
};
const banker: Rule = {
    id: 'banker',
    on: 'card_beaten',
    if: { beaten: { tag: 'banker' } },
    do: [
        { sound: 'boom' },
        { haptic: 'warning' },
        { anim: 'rain', target: 'beaten' },
        { anim: 'beat', target: 'defence' },
        { bubble: { uk: 'Мінус гроші!' }, target: 'beaten' },
    ],
    cooldownMs: 4000,
};
const beaten: TableEvent = { type: 'card_beaten', attack: ACE_H, defence: SIX_C, by: 'you' };

function deps(overrides: Partial<RuntimeDeps> = {}) {
    let now = 1000;
    const all = {
        audio: { play: vi.fn() },
        haptic: vi.fn(),
        animate: vi.fn(async () => {}),
        motionEnabled: () => true,
        now: () => now,
        random: () => 0.5,
        ...overrides,
    };
    return { deps: all, advance: (ms: number) => (now += ms) };
}

/** The table markup the runtime anchors to. */
function table(): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = `
        <div data-testid="opponent-avatar"></div>
        <div data-testid="felt"><button class="pair" data-attack="ACE_OF_HEARTS"><img><img class="card defence"></button></div>
        <div data-testid="you-avatar"></div>
        <div data-testid="hand"></div>`;
    document.body.append(root);
    return root;
}

describe('PackRuntime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('plays sounds and haptics at once', () => {
        const { deps: d } = deps();
        const runtime = new PackRuntime(pack([banker]), d);

        runtime.handle([beaten], { hand: [], phase: 'DEFEND' });

        expect(d.audio.play).toHaveBeenCalledWith('demo:boom');
        expect(d.haptic).toHaveBeenCalledWith('warning');
    });

    it('waits for the render to animate, toggling css classes and running primitives on the anchors', async () => {
        const { deps: d } = deps();
        const runtime = new PackRuntime(pack([banker]), d);
        const root = table();

        runtime.handle([beaten], { hand: [], phase: 'DEFEND' });
        const pair = root.querySelector('.pair');
        expect(pair?.classList.contains('fx-rain')).toBe(false);

        runtime.flush(root);
        expect(pair?.classList.contains('fx-rain')).toBe(true);
        expect(d.animate).toHaveBeenCalledWith(root.querySelector('.defence'), 'beat');
        vi.advanceTimersByTime(900);
        expect(pair?.classList.contains('fx-rain')).toBe(false);
    });

    it('skips css animations when motion is reduced', () => {
        const { deps: d } = deps({ motionEnabled: () => false });
        const runtime = new PackRuntime(pack([banker]), d);
        const root = table();

        runtime.handle([beaten], { hand: [], phase: 'DEFEND' });
        runtime.flush(root);

        expect(root.querySelector('.fx-rain')).toBeNull();
    });

    it('drops pending visuals when there is no table to draw on', () => {
        const { deps: d } = deps();
        const runtime = new PackRuntime(pack([banker]), d);

        runtime.handle([beaten], { hand: [], phase: 'DEFEND' });
        runtime.flush(null);
        runtime.flush(table());

        expect(d.animate).not.toHaveBeenCalled();
        expect(runtime.bubbles.value).toEqual([]);
    });

    it('respects cooldowns across events', () => {
        const { deps: d, advance } = deps();
        const runtime = new PackRuntime(pack([banker]), d);

        runtime.handle([beaten], { hand: [], phase: 'DEFEND' });
        advance(1000);
        runtime.handle([beaten], { hand: [], phase: 'DEFEND' });
        expect(d.audio.play).toHaveBeenCalledTimes(1);

        advance(3000);
        runtime.handle([beaten], { hand: [], phase: 'DEFEND' });
        expect(d.audio.play).toHaveBeenCalledTimes(2);
    });

    it('lays the hand out while the rule holds and drops the layout when it stops holding', () => {
        const { deps: d } = deps();
        const runtime = new PackRuntime(pack([sticky]), d);

        runtime.handle([{ type: 'hand_changed', hand: [KING_S, SIX_C, JACK_S] }], {
            hand: [KING_S, SIX_C, JACK_S],
            phase: 'ATTACK',
        });
        expect(runtime.layouts).toEqual([
            { layout: 'stick_together', cards: ['KING_OF_SPADES', 'JACK_OF_SPADES'] },
        ]);

        // Other events leave the layout alone.
        runtime.handle([{ type: 'turn_started', yours: true }], {
            hand: [KING_S, SIX_C, JACK_S],
            phase: 'ATTACK',
        });
        expect(runtime.layouts).toHaveLength(1);

        runtime.handle([{ type: 'hand_changed', hand: [SIX_C, JACK_S] }], {
            hand: [SIX_C, JACK_S],
            phase: 'ATTACK',
        });
        expect(runtime.layouts).toEqual([]);
    });

    it('shows at most two bubbles, anchored, each for a while', () => {
        const { deps: d } = deps();
        const chatty: Rule = {
            id: 'chatty',
            on: 'card_played',
            do: [{ bubble: { uk: 'Ха' }, target: 'opponent' }],
        };
        const runtime = new PackRuntime(pack([chatty]), d);
        const root = table();
        const played: TableEvent = { type: 'card_played', card: SIX_C, by: 'opponent' };

        for (let i = 0; i < 3; i++) {
            runtime.handle([played], { hand: [], phase: 'DEFEND' });
            runtime.flush(root);
        }
        expect(runtime.bubbles.value).toHaveLength(2);
        expect(runtime.bubbles.value[0]).toMatchObject({ ruleId: 'chatty', text: 'Ха' });

        vi.advanceTimersByTime(3000);
        expect(runtime.bubbles.value).toEqual([]);
    });

    it('warns once per unknown thing, however often it comes up', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { deps: d } = deps();
        const odd = { id: 'odd', on: 'card_played', do: [{ confetti: true }] } as unknown as Rule;
        const runtime = new PackRuntime(pack([odd]), d);

        for (let i = 0; i < 3; i++) {
            runtime.handle([{ type: 'card_played', card: SIX_C, by: 'you' }], { hand: [], phase: 'ATTACK' });
        }

        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('stops its timers when disposed', () => {
        const { deps: d } = deps();
        const runtime = new PackRuntime(pack([banker]), d);
        const root = table();
        runtime.handle([beaten], { hand: [], phase: 'DEFEND' });
        runtime.flush(root);

        runtime.dispose();
        vi.advanceTimersByTime(5000);

        expect(runtime.bubbles.value).toHaveLength(1);
    });
});

describe('PackBubbles', () => {
    it('renders each bubble where the runtime placed it', () => {
        const { deps: d } = deps();
        const runtime = new PackRuntime(pack([]), d);
        runtime.bubbles.value = [{ id: 1, ruleId: 'r', text: 'Ой', left: 10, top: 20 }];

        render(<PackBubbles runtime={runtime} />);

        const bubble = screen.getByTestId('pack-bubble');
        expect(bubble.getAttribute('data-rule')).toBe('r');
        expect(bubble.textContent).toBe('Ой');
        expect(bubble.style.left).toBe('10px');
        expect(bubble.style.top).toBe('20px');
    });
});
