import { t } from '../../i18n';
import { Button } from '../kit';

/** Recent opponents arrive with MVP 6; until then the screen explains itself and offers the one way to get a friend. */
export function Friends({ onInvite }: { onInvite: () => void }) {
    return (
        <section class="lobby" data-testid="friends-screen">
            <h1>{t('friends.title')}</h1>
            <div class="empty-state">
                <p class="notice">{t('friends.empty')}</p>
                <Button variant="primary" onClick={onInvite} data-testid="friends-invite">
                    {t('friends.invite')}
                </Button>
            </div>
        </section>
    );
}
