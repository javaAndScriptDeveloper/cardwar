import { signal } from '@preact/signals';
import type { DuelPhase } from '../api/types';
import type { Card } from '../game/cards';
import type { TableEvent } from '../game/diff';
import type { Primitive } from '../motion';
import type { HapticKind } from '../telegram/webapp';
import { type Action, type Anchor, evaluate } from './engine';
import type { LayoutDirective } from './layout';
import type { PackManifest } from './types';

/** How long a speech bubble stays up, and how many may be on screen at once (the spec's global cap). */
const BUBBLE_MS = 2500;
const MAX_BUBBLES = 2;

export interface Bubble {
    id: number;
    ruleId: string;
    text: string;
    /** Pixels from the duel root's top-left corner. */
    left: number;
    top: number;
}

/** Everything the runtime touches, injected so the duel screen passes the real primitives and tests pass fakes. */
export interface RuntimeDeps {
    /** Already gated by the sound setting. */
    audio: { play(name: string): void };
    /** Gated by the sound setting too; false means nothing was spoken, so the line is shown instead. */
    speech: { say(text: string, options?: { rate?: number; pitch?: number }): boolean };
    /** Already gated by the vibration setting. */
    haptic: (kind: HapticKind) => void;
    /** Already gated by reduced motion. */
    animate: (el: Element, primitive: Primitive) => Promise<void>;
    /** Gates the css-class effects, which do not go through `animate`. */
    motionEnabled: () => boolean;
    now: () => number;
    random: () => number;
}

interface ViewFacts {
    hand: readonly Card[];
    phase: DuelPhase | undefined;
}

type Visual = Extract<Action, { kind: 'css' | 'motion' | 'bubble' }>;

const AREA_SELECTORS = {
    hand: '[data-testid="hand"]',
    table: '[data-testid="pairs"]',
    felt: '[data-testid="felt"]',
    you: '[data-testid="you-avatar"]',
    opponent: '[data-testid="opponent-avatar"]',
} as const;

function find(root: HTMLElement, anchor: Anchor): HTMLElement | null {
    if ('area' in anchor) {
        return root.querySelector<HTMLElement>(AREA_SELECTORS[anchor.area]);
    }
    // Card ids come from cardId() of a table event, never from pack text, so they are safe in a selector.
    const pair = root.querySelector<HTMLElement>(`.pair[data-attack="${anchor.card}"]`);
    return anchor.slot === 'attack' ? pair : (pair?.querySelector<HTMLElement>('.defence') ?? null);
}

/**
 * Runs the equipped pack's rules on the events of your own view. Sounds and haptics fire at once; animations and
 * bubbles wait for `flush`, after the view that caused them has rendered. Layouts are recomputed on every
 * `hand_changed` and read by the table. Only your equipped pack runs here, never the opponent's.
 */
export class PackRuntime {
    readonly bubbles = signal<Bubble[]>([]);
    layouts: LayoutDirective[] = [];
    private readonly lastFired = new Map<string, number>();
    private readonly warned = new Set<string>();
    private readonly timers = new Set<ReturnType<typeof setTimeout>>();
    private pending: { ruleId: string; action: Visual }[] = [];
    private nextBubble = 1;

    constructor(
        readonly pack: PackManifest,
        private readonly deps: RuntimeDeps,
    ) {}

    handle(events: readonly TableEvent[], view: ViewFacts): void {
        for (const event of events) {
            const firings = evaluate(this.pack.rules ?? [], event, {
                pack: this.pack,
                hand: view.hand,
                phase: view.phase,
                now: this.deps.now(),
                lastFired: this.lastFired,
                random: this.deps.random,
                warn: (message) => this.warn(message),
            });
            const layouts: LayoutDirective[] = [];
            for (const { ruleId, actions } of firings) {
                this.lastFired.set(ruleId, this.deps.now());
                for (const action of actions) {
                    switch (action.kind) {
                        case 'sound':
                            this.deps.audio.play(action.name);
                            break;
                        case 'haptic':
                            this.deps.haptic(action.haptic);
                            break;
                        case 'layout':
                            layouts.push({ layout: action.layout, cards: action.cards });
                            break;
                        case 'say': {
                            const { rate, pitch } = action;
                            const options = {
                                ...(rate !== undefined ? { rate } : {}),
                                ...(pitch !== undefined ? { pitch } : {}),
                            };
                            if (!this.deps.speech.say(action.text.uk, options)) {
                                this.pending.push({
                                    ruleId,
                                    action: { kind: 'bubble', text: action.text, anchor: action.anchor },
                                });
                            }
                            break;
                        }
                        default:
                            this.pending.push({ ruleId, action });
                    }
                }
            }
            if (event.type === 'hand_changed') {
                this.layouts = layouts;
            }
        }
    }

    /** Applies the visuals queued since the last flush to the rendered table; with no table they are dropped. */
    flush(root: HTMLElement | null): void {
        const pending = this.pending;
        this.pending = [];
        if (!root) {
            return;
        }
        for (const { ruleId, action } of pending) {
            const el = find(root, action.anchor);
            if (!el) {
                continue;
            }
            switch (action.kind) {
                case 'motion':
                    void this.deps.animate(el, action.primitive);
                    break;
                case 'css':
                    if (this.deps.motionEnabled()) {
                        el.classList.remove(action.className);
                        void el.offsetWidth; // restart the animation if the class was still on
                        el.classList.add(action.className);
                        this.later(action.durationMs, () => el.classList.remove(action.className));
                    }
                    break;
                case 'bubble':
                    this.bubble(ruleId, action.text.uk, root, el);
                    break;
            }
        }
    }

    dispose(): void {
        for (const timer of this.timers) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }

    private bubble(ruleId: string, text: string, root: HTMLElement, el: HTMLElement): void {
        const box = el.getBoundingClientRect();
        const origin = root.getBoundingClientRect();
        const bubble: Bubble = {
            id: this.nextBubble++,
            ruleId,
            text,
            left: Math.round(box.left - origin.left + box.width / 2),
            top: Math.round(box.top - origin.top),
        };
        this.bubbles.value = [...this.bubbles.value, bubble].slice(-MAX_BUBBLES);
        this.later(BUBBLE_MS, () => {
            this.bubbles.value = this.bubbles.value.filter((other) => other.id !== bubble.id);
        });
    }

    private later(ms: number, run: () => void): void {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            run();
        }, ms);
        this.timers.add(timer);
    }

    private warn(message: string): void {
        if (!this.warned.has(message)) {
            this.warned.add(message);
            console.warn(message);
        }
    }
}

/** The speech-bubble layer over the table; positioned by the runtime, purely decorative to assistive tech. */
export function PackBubbles({ runtime }: { runtime: PackRuntime }) {
    return (
        <div class="pack-bubbles" aria-hidden="true">
            {runtime.bubbles.value.map((bubble) => (
                <div
                    key={bubble.id}
                    class="pack-bubble"
                    data-testid="pack-bubble"
                    data-rule={bubble.ruleId}
                    style={{ left: `${bubble.left}px`, top: `${bubble.top}px` }}
                >
                    {bubble.text}
                </div>
            ))}
        </div>
    );
}
