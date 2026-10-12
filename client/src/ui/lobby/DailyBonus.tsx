import { useEffect, useState } from 'preact/hooks';
import type { DailyBonusView } from '../../api/types';
import { t } from '../../i18n';
import { Button, CoinAmount } from '../kit';

interface Props {
    bonus: DailyBonusView;
    onClaim: () => Promise<void>;
    /** Called once the countdown runs out, so the wallet can be re-read and the bonus offered again. */
    onDue: () => void;
    now?: () => number;
}

/** 3h 2m 5s → "3:02:05". */
export function countdown(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

/** Today's bonus and the streak it belongs to; once taken, the time until the next Kyiv midnight. */
export function DailyBonus({ bonus, onClaim, onDue, now = Date.now }: Props) {
    const [busy, setBusy] = useState(false);
    const [, tick] = useState(0);
    const remaining = Date.parse(bonus.nextAt) - now();

    useEffect(() => {
        if (bonus.available) {
            return;
        }
        let due = false;
        const timer = setInterval(() => {
            tick((n) => n + 1);
            if (!due && Date.parse(bonus.nextAt) - now() <= 0) {
                due = true;
                onDue();
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [bonus.available, bonus.nextAt, now, onDue]);

    const claim = async () => {
        setBusy(true);
        try {
            await onClaim();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            class={`panel daily-bonus${bonus.available ? '' : ' claimed'}`}
            data-testid="daily-bonus"
            data-available={String(bonus.available)}
            data-amount={bonus.amount}
            data-streak={bonus.streakDay}
        >
            <div class="row">
                <span class="title">{t('lobby.bonus.title')}</span>
                <span class="notice">{t('lobby.bonus.day', { n: bonus.streakDay })}</span>
            </div>
            <Button
                variant={bonus.available ? 'primary' : 'secondary'}
                busy={busy}
                disabled={!bonus.available}
                onClick={() => void claim()}
                data-testid="claim-bonus"
            >
                {bonus.available ? (
                    <>
                        {t('lobby.bonus.claim')} <CoinAmount amount={bonus.amount} signed />
                    </>
                ) : (
                    <span data-testid="bonus-countdown">
                        {t('lobby.bonus.next', { time: countdown(remaining) })}
                    </span>
                )}
            </Button>
        </div>
    );
}
