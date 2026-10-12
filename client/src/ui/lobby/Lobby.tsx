import { useState } from 'preact/hooks';
import type { SignedInPlayer } from '../../auth/session';
import { t } from '../../i18n';
import { Avatar, Badge, Button } from '../kit';
import { JoinByCode } from './JoinByCode';

interface Props {
    player: SignedInPlayer;
    error: string | undefined;
    onInvite: () => Promise<void>;
    onJoin: (inviteId: string) => Promise<void>;
}

/** The start screen: who you are, one big button to invite, and the way in when a friend sent you a code. */
export function Lobby({ player, error, onInvite, onJoin }: Props) {
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
            </header>
            {error && (
                <p class="error" role="alert">
                    {error}
                </p>
            )}
            <Button
                variant="primary"
                size="lg"
                busy={busy}
                onClick={() => void run(onInvite)()}
                data-testid="invite"
            >
                {t('lobby.invite')}
            </Button>
            <div class="panel soon" data-testid="quick-match">
                <div class="row">
                    <span class="title">{t('lobby.quickMatch')}</span>
                    <Badge tone="accent">{t('lobby.soon')}</Badge>
                </div>
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
