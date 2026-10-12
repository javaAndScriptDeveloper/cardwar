import { useEffect, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../../api/client';
import { t } from '../../i18n';
import { describeError } from '../errors';
import { Button, CoinAmount } from '../kit';

interface Props {
    inviteId: string;
    /** What the duel is played for; 0 is friendly. */
    stake: number;
    api: Pick<ApiClient, 'inviteStatus'>;
    pollMs: number;
    link: string;
    onShare: (link: string) => void;
    onAccepted: (duelId: string) => void;
    onExpired: () => void;
    onCancel: () => void;
}

/** The creator's side of an invite: share it, show the code, and poll until a friend accepts. */
export function Waiting({
    inviteId,
    stake,
    api,
    pollMs,
    link,
    onShare,
    onAccepted,
    onExpired,
    onCancel,
}: Props) {
    const [problem, setProblem] = useState<string>();

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // The duel does not exist until somebody accepts, so there is nothing to subscribe to yet: poll the invite.
        const poll = async () => {
            try {
                const status = await api.inviteStatus(inviteId);
                if (stopped) {
                    return;
                }
                if (status.status === 'ACCEPTED' && status.duelId) {
                    onAccepted(status.duelId);
                    return;
                }
                setProblem(undefined);
            } catch (error) {
                if (stopped) {
                    return;
                }
                if (error instanceof ApiError && error.status === 404) {
                    onExpired();
                    return;
                }
                setProblem(t('waiting.trouble', { error: describeError(error) }));
            }
            timer = setTimeout(poll, pollMs);
        };
        timer = setTimeout(poll, pollMs);
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [inviteId, api, pollMs, onAccepted, onExpired]);

    return (
        <section class="lobby" data-testid="waiting-screen">
            <h1>{t('waiting.title')}</h1>
            <p class="notice">{t('waiting.hint')}</p>
            <p class="notice" data-testid="invite-stake" data-stake={stake}>
                {stake > 0 ? (
                    <>
                        {t('waiting.stake')} <CoinAmount amount={stake} />
                    </>
                ) : (
                    t('waiting.friendly')
                )}
            </p>
            <Button variant="primary" size="lg" onClick={() => onShare(link)} data-testid="share-invite">
                {t('waiting.share')}
            </Button>
            <div class="panel">
                <span class="notice">{t('waiting.codeHint')}</span>
                <code class="invite-code" data-testid="invite-code">
                    {inviteId}
                </code>
                <CopyButton text={inviteId} />
            </div>
            {problem && (
                <p class="error" role="alert">
                    {problem}
                </p>
            )}
            <Button variant="ghost" onClick={onCancel} data-testid="cancel-invite">
                {t('waiting.cancel')}
            </Button>
        </section>
    );
}

/** Copying a 36-character code by hand inside a Telegram webview is fiddly; one tap is not. */
function CopyButton({ text }: { text: string }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setState('copied');
        } catch {
            setState('failed');
        }
    };
    return (
        <>
            <Button onClick={() => void copy()} data-testid="copy-code">
                {state === 'copied' ? t('waiting.copied') : t('waiting.copy')}
            </Button>
            {state === 'failed' && <span class="notice">{t('waiting.copyBlocked')}</span>}
        </>
    );
}
