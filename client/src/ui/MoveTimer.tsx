import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { serverNow } from '../state/clock';

export type ClockWarning = 'ten' | 'five';

interface Props {
    /** ISO instant the player to move must act by, on the server's clock. */
    deadline: string;
    side: 'you' | 'opponent';
    /** Called once per deadline as your own clock reaches ten and five seconds. */
    onWarning?: ((warning: ClockWarning) => void) | undefined;
}

/** The server's move timeout; the bar is full at this much time left. A longer deadline just starts full. */
const FULL_MS = 30_000;
const TICK_MS = 250;
const URGENT_S = 10;
const THRESHOLDS: [ClockWarning, number][] = [
    ['ten', 10],
    ['five', 5],
];

const remainingMs = (deadline: string) => Math.max(0, Date.parse(deadline) - serverNow());

/**
 * A shrinking bar for whoever's clock runs. Display only: the server enforces the deadline and moves on the
 * player's behalf when it passes; nothing here sends a move.
 */
export function MoveTimer({ deadline, side, onWarning }: Props) {
    const [left, setLeft] = useState(() => remainingMs(deadline));
    const fired = useRef<{ deadline: string; warnings: Set<ClockWarning> }>({
        deadline,
        warnings: new Set(),
    });

    useEffect(() => {
        setLeft(remainingMs(deadline));
        const tick = setInterval(() => setLeft(remainingMs(deadline)), TICK_MS);
        return () => clearInterval(tick);
    }, [deadline]);

    const seconds = Math.ceil(left / 1000);

    useEffect(() => {
        if (fired.current.deadline !== deadline) {
            fired.current = { deadline, warnings: new Set() };
        }
        if (side !== 'you' || !onWarning || seconds <= 0) {
            return;
        }
        for (const [warning, at] of THRESHOLDS) {
            if (seconds <= at && !fired.current.warnings.has(warning)) {
                fired.current.warnings.add(warning);
                onWarning(warning);
            }
        }
    }, [deadline, side, seconds, onWarning]);

    const urgent = seconds <= URGENT_S;
    return (
        <div
            class={`move-timer ${side}${urgent ? ' urgent' : ''}`}
            data-testid="move-timer"
            data-to-move={side}
            data-seconds={seconds}
            role="timer"
            aria-label={
                side === 'you'
                    ? t('duel.timer.you', { n: seconds })
                    : t('duel.timer.opponent', { n: seconds })
            }
        >
            <div class="move-timer-fill" style={{ width: `${(Math.min(left, FULL_MS) / FULL_MS) * 100}%` }} />
        </div>
    );
}
