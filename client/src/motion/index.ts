import { settings } from '../state/settings';

/**
 * Named effects on the Web Animations API, so the duel screen (and later the content rule engine) share one
 * vocabulary for motion. Every primitive is cosmetic, resolves at once when motion is off or the platform lacks
 * WAAPI, and never throws.
 */
export type Primitive = 'glide' | 'flip' | 'beat' | 'take' | 'discard' | 'deal' | 'shake' | 'pulse';

export interface MotionOptions {
    /** For `glide`: where the element visually starts (FLIP), relative to `to` (its resting rect). */
    from?: DOMRect;
    to?: DOMRect;
    /** For `take` / `discard`: where the cards fly off to, in pixels relative to the element. */
    dx?: number;
    dy?: number;
    durationMs?: number;
}

const EASE = 'cubic-bezier(.2,.8,.2,1)';

type Spec = { frames: Keyframe[]; ms: number };

const SPECS: Record<Exclude<Primitive, 'glide'>, (options: MotionOptions) => Spec> = {
    flip: () => ({ frames: [{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0deg)' }], ms: 220 }),
    beat: () => ({
        frames: [
            { transform: 'scale(1.25) rotate(-6deg)', offset: 0 },
            { transform: 'scale(0.96) rotate(2deg)', offset: 0.6 },
            { transform: 'scale(1) rotate(0deg)', offset: 1 },
        ],
        ms: 320,
    }),
    take: ({ dx = 0, dy = 160 }) => ({
        frames: [
            { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0.2 },
        ],
        ms: 380,
    }),
    discard: ({ dx = 140, dy = -40 }) => ({
        frames: [
            { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) rotate(25deg)`, opacity: 0 },
        ],
        ms: 360,
    }),
    deal: () => ({
        frames: [
            { transform: 'translateY(-40px) scale(0.9)', opacity: 0 },
            { transform: 'translateY(0px) scale(1)', opacity: 1 },
        ],
        ms: 260,
    }),
    shake: () => ({
        frames: [0, -8, 8, -6, 6, 0].map((x) => ({ transform: `translateX(${x}px)` })),
        ms: 300,
    }),
    pulse: () => ({
        frames: [
            { boxShadow: '0 0 0 0 rgb(59 130 246 / 60%)' },
            { boxShadow: '0 0 0 12px rgb(59 130 246 / 0%)' },
        ],
        ms: 700,
    }),
};

function glide({ from, to }: MotionOptions): Spec {
    const dx = (from?.left ?? 0) - (to?.left ?? 0);
    const dy = (from?.top ?? 0) - (to?.top ?? 0);
    return {
        frames: [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        ms: 280,
    };
}

/** False when the player asked for less motion, in settings or at the OS level. */
export function motionEnabled(): boolean {
    if (settings.value.reducedMotion) {
        return false;
    }
    return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export async function animate(el: Element, primitive: Primitive, options: MotionOptions = {}): Promise<void> {
    if (!motionEnabled() || typeof el.animate !== 'function') {
        return;
    }
    const { frames, ms } = primitive === 'glide' ? glide(options) : SPECS[primitive](options);
    try {
        await el.animate(frames, { duration: options.durationMs ?? ms, easing: EASE, fill: 'none' }).finished;
    } catch {
        // Cancelled by a re-render or a newer animation on the same element: fine.
    }
}

/** FLIP: the element already sits at its destination; play it from where `target` is. */
export function flyTo(el: Element, target: Element): Promise<void> {
    return animate(el, 'glide', { from: target.getBoundingClientRect(), to: el.getBoundingClientRect() });
}
