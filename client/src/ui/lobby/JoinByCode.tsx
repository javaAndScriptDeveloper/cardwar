import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Button } from '../kit';

/** For a friend who sent the code instead of the link, or outside Telegram. */
export function JoinByCode({ busy, onJoin }: { busy: boolean; onJoin: (inviteId: string) => Promise<void> }) {
    const [code, setCode] = useState('');
    const trimmed = code.trim();

    return (
        <form
            class="panel"
            onSubmit={(event) => {
                event.preventDefault();
                if (trimmed) {
                    void onJoin(trimmed);
                }
            }}
        >
            <label>
                {t('lobby.joinTitle')}
                <input
                    name="invite-code"
                    data-testid="join-code"
                    value={code}
                    onInput={(event) => setCode(event.currentTarget.value)}
                    placeholder={t('lobby.joinPlaceholder')}
                    autoComplete="off"
                />
            </label>
            <Button type="submit" disabled={busy || !trimmed} data-testid="join">
                {t('lobby.join')}
            </Button>
        </form>
    );
}
