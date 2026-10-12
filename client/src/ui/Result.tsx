import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Result as Outcome } from '../game/diff';
import { t } from '../i18n';
import { animate, motionEnabled } from '../motion';
import { Avatar, Button, CoinAmount } from './kit';
import type { Participant } from './Table';

export interface ResultProps {
    result: Outcome;
    /** The caller's signed net for a staked duel; undefined for a friendly one. */
    coins: number | undefined;
    stake: number;
    opponent: Participant;
    /** Head-to-head record with this opponent, this duel included. */
    record?: { won: number; lost: number } | undefined;
    /** Lines about streak, XP and missions; rendered as given so the retention slice owns their shape. */
    progress?: ComponentChildren;
    /** Present when the opponent can be challenged again right away. */
    rematch?: { busy: boolean; onRematch: () => void } | undefined;
    /** The opponent already asked for a rematch. */
    incoming?: { stake: number; busy: boolean; onAccept: () => void } | undefined;
    onHome: () => void;
}

const COUNT_UP_MS = 900;
const COUNT_TICK_MS = 30;
const CONFETTI = 18;

/** 0 → `target` over COUNT_UP_MS, eased; reduced motion jumps straight there. */
function useCountUp(target: number): number {
    const [shown, setShown] = useState(motionEnabled() ? 0 : target);
    useEffect(() => {
        if (!motionEnabled()) {
            setShown(target);
            return;
        }
        const started = Date.now();
        const tick = setInterval(() => {
            const p = Math.min(1, (Date.now() - started) / COUNT_UP_MS);
            const eased = 1 - (1 - p) * (1 - p);
            setShown(Math.round(target * eased));
            if (p >= 1) {
                clearInterval(tick);
            }
        }, COUNT_TICK_MS);
        return () => clearInterval(tick);
    }, [target]);
    return shown;
}

function explain(result: Outcome, opponentName: string): string {
    // Three missed moves end the duel without anyone running out of cards; the usual sentence would be wrong.
    if (result.reason === 'FORFEIT' && result.result !== 'DRAW') {
        return result.result === 'WON' ? t('duel.explainForfeit.WON') : t('duel.explainForfeit.LOST');
    }
    return t(`duel.explain.${result.result}`, { name: opponentName });
}

/**
 * The screen a player stares at longest. It celebrates or consoles (confetti or a shake), counts the coins up,
 * shows who it was against and the running score, and puts the rematch one tap away. Everything here is
 * presentation: the duel screen owns the data and the calls.
 */
export function Result({
    result,
    coins,
    stake,
    opponent,
    record,
    progress,
    rematch,
    incoming,
    onHome,
}: ResultProps) {
    const tone = result.result === 'WON' ? 'win' : result.result === 'LOST' ? 'loss' : 'draw';
    const counted = useCountUp(coins ?? 0);
    const hero = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        if (hero.current) {
            void animate(hero.current, tone === 'loss' ? 'shake' : 'beat', {});
        }
    }, [tone]);

    return (
        <section
            class={`result ${result.result.toLowerCase()} ${tone}`}
            data-testid="result"
            data-result={result.result}
            ref={(el) => {
                if (el) {
                    void animate(el, 'deal', {});
                }
            }}
        >
            {tone === 'win' && motionEnabled() && (
                <div class="confetti" aria-hidden="true">
                    {Array.from({ length: CONFETTI }, (_, i) => (
                        <i key={i} style={{ '--i': i }} />
                    ))}
                </div>
            )}
            <h1 ref={hero} class={`result-hero ${tone}`}>
                {t(`duel.result.${result.result}`)}
            </h1>
            <p class="result-explain">{explain(result, opponent.name)}</p>

            <div class="result-opponent" data-testid="result-opponent">
                <Avatar name={opponent.name} photoUrl={opponent.photoUrl} size={40} />
                <span class="name">{t('duel.versus', { name: opponent.name })}</span>
                {record && (
                    <span class="record" title={t('duel.record')} data-testid="result-record">
                        {record.won}:{record.lost}
                    </span>
                )}
            </div>

            {coins !== undefined && (
                <div class="coin-delta" data-testid="coin-delta" data-delta={coins}>
                    <CoinAmount amount={counted} signed />
                </div>
            )}

            {progress}

            {incoming && (
                <div
                    class="rematch-incoming"
                    data-testid="rematch-incoming"
                    data-stake={incoming.stake}
                    role="status"
                >
                    <span>{t('duel.rematchIncoming', { name: opponent.name })}</span>
                    <Button
                        variant="primary"
                        busy={incoming.busy}
                        onClick={incoming.onAccept}
                        data-testid="accept-rematch"
                    >
                        {t('duel.acceptRematch')}
                    </Button>
                </div>
            )}

            <div class="result-actions">
                {rematch && !incoming && (
                    <Button
                        variant="primary"
                        size="lg"
                        busy={rematch.busy}
                        onClick={rematch.onRematch}
                        data-testid="rematch"
                    >
                        {stake > 0 ? t('duel.rematchFor', { n: stake }) : t('duel.rematch')}
                    </Button>
                )}
                <Button size="lg" onClick={onHome} data-testid="back-to-lobby">
                    {t('duel.back')}
                </Button>
            </div>
        </section>
    );
}
