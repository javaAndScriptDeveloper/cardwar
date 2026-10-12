import { useEffect, useState } from 'preact/hooks';
import type { ApiClient } from '../../api/client';
import { t } from '../../i18n';
import { serverNow } from '../../state/clock';
import { describeError } from '../errors';
import { Button, CoinAmount } from '../kit';

interface Props {
    /** The table the player queued at; 0 is friendly. */
    stake: number;
    /** ISO instant the server queued the player, so the elapsed time survives a reopened app. */
    since: string;
    api: Pick<ApiClient, 'matchmakingStatus'>;
    pollMs: number;
    onMatched: (duelId: string) => void;
    /** The entry expired, or the server no longer has one. */
    onExpired: () => void;
    onCancel: () => void;
}

const elapsedSeconds = (since: string) => Math.max(0, Math.floor((serverNow() - Date.parse(since)) / 1000));

/** Quick match in progress: the stake, how long it has been, and a way out. Polls until the server pairs us. */
export function Searching({ stake, since, api, pollMs, onMatched, onExpired, onCancel }: Props) {
    const [problem, setProblem] = useState<string>();
    const [elapsed, setElapsed] = useState(() => elapsedSeconds(since));

    useEffect(() => {
        const tick = setInterval(() => setElapsed(elapsedSeconds(since)), 1000);
        return () => clearInterval(tick);
    }, [since]);

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // The duel does not exist until the server pairs us, so there is nothing to subscribe to yet: poll the entry.
        const poll = async () => {
            try {
                const entry = await api.matchmakingStatus();
                if (stopped) {
                    return;
                }
                if (entry?.status === 'MATCHED' && entry.duelId) {
                    onMatched(entry.duelId);
                    return;
                }
                if (!entry || entry.status === 'EXPIRED') {
                    onExpired();
                    return;
                }
                setProblem(undefined);
            } catch (error) {
                if (stopped) {
                    return;
                }
                setProblem(t('searching.trouble', { error: describeError(error) }));
            }
            timer = setTimeout(poll, pollMs);
        };
        timer = setTimeout(poll, pollMs);
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [api, pollMs, onMatched, onExpired]);

    return (
        <section class="lobby" data-testid="searching-screen">
            <h1>{t('searching.title')}</h1>
            <p class="notice" data-testid="search-stake" data-stake={stake}>
                {stake > 0 ? (
                    <>
                        {t('searching.stake')} <CoinAmount amount={stake} />
                    </>
                ) : (
                    t('searching.friendly')
                )}
            </p>
            <div class="searching-spinner" aria-hidden="true" />
            <p class="notice" data-testid="search-elapsed" data-seconds={elapsed}>
                {t('searching.elapsed', { n: elapsed })}
            </p>
            {problem && (
                <p class="error" role="alert">
                    {problem}
                </p>
            )}
            <Button variant="ghost" onClick={onCancel} data-testid="cancel-search">
                {t('searching.cancel')}
            </Button>
        </section>
    );
}
