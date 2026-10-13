import { useState } from 'preact/hooks';
import type { MissionView, ProgressView, ShopItemView, WalletView } from '../../api/types';
import type { SignedInPlayer } from '../../auth/session';
import { t } from '../../i18n';
import { Avatar, Button, CoinAmount } from '../kit';
import { DailyBonus } from './DailyBonus';
import { DropTeaser } from './DropTeaser';
import { JoinByCode } from './JoinByCode';
import { Missions } from './Missions';
import { StreakChip } from './StreakChip';

interface Props {
    player: SignedInPlayer;
    error: string | undefined;
    /** Undefined until the first load; the chip and the bonus card wait for it. */
    wallet: WalletView | undefined;
    /** Streak and rank; undefined until loaded, and the chip waits for it. */
    progress?: ProgressView | undefined;
    /** Today's missions; undefined until loaded. */
    missions?: MissionView[] | undefined;
    /** This week's drop, when the shop has one on sale. */
    drop?: ShopItemView | undefined;
    onClaimMission?: ((code: string) => Promise<void>) | undefined;
    onOpenShop?: (() => void) | undefined;
    /** An invite is being created (after a stake was picked). */
    creating: boolean;
    /** Opens the stake picker; the invite itself is created once a stake is chosen. */
    onInvite: () => void;
    /** Opens the stake picker for a quick match with whoever is waiting at that table. */
    onQuickMatch: () => void;
    onJoin: (inviteId: string) => Promise<void>;
    onClaimBonus: () => Promise<void>;
    onBonusDue: () => void;
}

/** The start screen: who you are, one big button to invite, and the way in when a friend sent you a code. */
export function Lobby({
    player,
    error,
    wallet,
    progress,
    missions,
    drop,
    onClaimMission,
    onOpenShop,
    creating,
    onInvite,
    onQuickMatch,
    onJoin,
    onClaimBonus,
    onBonusDue,
}: Props) {
    const [busy, setBusy] = useState(false);
    const name = player.displayName ?? player.username;
    const run = (action: () => Promise<void>) => async () => {
        setBusy(true);
        try {
            await action();
        } finally {
            setBusy(false);
        }
    };

    return (
        <section class="lobby" data-testid="lobby-screen">
            <header class="lobby-header">
                <Avatar name={name} photoUrl={player.photoUrl} size={48} data-testid="lobby-avatar" />
                <div>
                    <h1>{t('lobby.greeting', { name })}</h1>
                    <p class="notice">{t('lobby.tagline')}</p>
                </div>
                {wallet && (
                    <span
                        class="balance-chip"
                        data-testid="balance"
                        data-balance={wallet.balance}
                        aria-label={t('lobby.balance')}
                    >
                        <CoinAmount amount={wallet.balance} />
                    </span>
                )}
            </header>
            {progress && <StreakChip progress={progress} />}
            {error && (
                <p class="error" role="alert">
                    {error}
                </p>
            )}
            <Button
                variant="primary"
                size="lg"
                busy={creating}
                disabled={busy}
                onClick={onInvite}
                data-testid="invite"
            >
                {t('lobby.invite')}
            </Button>
            {wallet && <DailyBonus bonus={wallet.dailyBonus} onClaim={onClaimBonus} onDue={onBonusDue} />}
            {missions && onClaimMission && <Missions missions={missions} onClaim={onClaimMission} />}
            {drop && onOpenShop && <DropTeaser drop={drop} onOpenShop={onOpenShop} />}
            <div class="panel quick-match">
                <Button
                    variant="primary"
                    size="lg"
                    disabled={busy || creating}
                    onClick={onQuickMatch}
                    data-testid="quick-match"
                >
                    {t('lobby.quickMatch')}
                </Button>
                <span class="notice">{t('lobby.quickMatchHint')}</span>
            </div>
            <JoinByCode busy={busy} onJoin={(code) => run(() => onJoin(code))()} />
            <ol class="how-to">
                <li>{t('lobby.howTo1')}</li>
                <li>{t('lobby.howTo2')}</li>
                <li>{t('lobby.howTo3')}</li>
            </ol>
        </section>
    );
}
