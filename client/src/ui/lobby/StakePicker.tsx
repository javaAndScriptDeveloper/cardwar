import { t } from '../../i18n';
import { Button, CoinAmount, Sheet } from '../kit';

/** The server's stake tables; 0 is a friendly duel with no escrow. The server validates, this only offers. */
export const STAKES = [0, 100, 500, 1000, 5000] as const;

interface Props {
    open: boolean;
    /** Undefined until the wallet loads: only the friendly duel is offered then. */
    balance: number | undefined;
    onPick: (stake: number) => void;
    onClose: () => void;
}

/** Bottom sheet between "Запросити друга" and the invite: what the duel is played for. */
export function StakePicker({ open, balance, onPick, onClose }: Props) {
    return (
        <Sheet open={open} title={t('stake.title')} onClose={onClose}>
            <div class="stake-options" data-testid="stake-picker">
                <p class="notice">{t('stake.hint')}</p>
                {STAKES.map((stake) => (
                    <Button
                        key={stake}
                        variant={stake === 0 ? 'primary' : 'secondary'}
                        size="lg"
                        disabled={stake > (balance ?? 0)}
                        onClick={() => onPick(stake)}
                        data-testid={`stake-${stake}`}
                    >
                        {stake === 0 ? (
                            <>
                                <span>{t('stake.friendly')}</span>
                                <span class="notice">{t('stake.friendlyHint')}</span>
                            </>
                        ) : (
                            <CoinAmount amount={stake} />
                        )}
                    </Button>
                ))}
            </div>
        </Sheet>
    );
}
