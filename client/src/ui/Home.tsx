import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../api/client';
import type { SignedInPlayer } from '../auth/session';
import { inviteLink, shareUrl, type LinkConfig } from '../telegram/links';
import type { Telegram } from '../telegram/webapp';
import { t } from '../i18n';
import { describeError } from './errors';

type LobbyApi = Pick<
    ApiClient,
    'activeDuels' | 'pendingInvite' | 'createInvite' | 'inviteStatus' | 'acceptInvite'
>;

interface Props {
    player: SignedInPlayer;
    api: LobbyApi;
    telegram: Telegram;
    /** Invite id the app was opened with (Telegram start_param, or ?invite= in the dev shim). */
    invite: string | undefined;
    links: LinkConfig;
    table: (duelId: string, exit: () => void) => ComponentChildren;
    pollMs?: number;
}

type Screen =
    | { kind: 'loading' }
    | { kind: 'start'; error?: string | undefined }
    | { kind: 'waiting'; inviteId: string }
    | { kind: 'table'; duelId: string };

/** Turns an invite failure into a sentence; the status codes are the backend's documented invite answers. */
function inviteProblem(error: unknown): string {
    if (error instanceof ApiError) {
        switch (error.status) {
            case 404:
                return t('lobby.errors.inviteExpired');
            case 400:
                return t('lobby.errors.ownInvite');
            case 409:
                return t('lobby.errors.inviteTaken');
        }
    }
    return t('lobby.errors.join', { error: describeError(error) });
}

/**
 * Where a signed-in player lands: back into a running duel, into the duel an invite link names, or on the start
 * screen to invite someone. Everything here is navigation; the table owns the game.
 */
export function Home({ player, api, telegram, invite, links, table, pollMs = 2000 }: Props) {
    const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
    // The launch invite is accepted at most once per app session; returning to start must not re-accept it.
    const launchInviteRef = useRef(invite);

    const join = async (inviteId: string) => {
        try {
            const view = await api.acceptInvite(inviteId);
            setScreen({ kind: 'table', duelId: view.duelId });
        } catch (error) {
            setScreen({ kind: 'start', error: inviteProblem(error) });
        }
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const active = await api.activeDuels();
                if (cancelled) {
                    return;
                }
                const resume = active[0];
                if (resume) {
                    setScreen({ kind: 'table', duelId: resume.duelId });
                    return;
                }
            } catch (error) {
                if (!cancelled) {
                    setScreen({
                        kind: 'start',
                        error: t('lobby.errors.loadDuels', { error: describeError(error) }),
                    });
                }
                return;
            }
            const launchInvite = launchInviteRef.current;
            launchInviteRef.current = undefined;
            if (launchInvite) {
                await join(launchInvite);
                return;
            }
            // Telegram reloads the Mini App whenever the player switches to a chat to send the code, so the
            // invite being waited on has to come back from the server rather than from memory.
            const own = await api.pendingInvite().catch(() => undefined);
            if (cancelled) {
                return;
            }
            setScreen(own ? { kind: 'waiting', inviteId: own.inviteId } : { kind: 'start' });
        })();
        return () => {
            cancelled = true;
        };
        // Runs once per mount: launch-time routing only, so it deliberately has no dependencies.
    }, []);

    const createInvite = async () => {
        try {
            const created = await api.createInvite();
            setScreen({ kind: 'waiting', inviteId: created.inviteId });
        } catch (error) {
            setScreen({
                kind: 'start',
                error: t('lobby.errors.createInvite', { error: describeError(error) }),
            });
        }
    };

    switch (screen.kind) {
        case 'loading':
            return <p class="notice">{t('app.loading')}</p>;
        case 'table':
            return table(screen.duelId, () => setScreen({ kind: 'start' }));
        case 'waiting':
            return (
                <Waiting
                    inviteId={screen.inviteId}
                    api={api}
                    pollMs={pollMs}
                    link={inviteLink(screen.inviteId, links)}
                    onShare={(link) => telegram.openTelegramLink(shareUrl(link, t('waiting.shareText')))}
                    onAccepted={(duelId) => setScreen({ kind: 'table', duelId })}
                    onExpired={() => setScreen({ kind: 'start', error: t('lobby.errors.waitExpired') })}
                    onCancel={() => setScreen({ kind: 'start' })}
                />
            );
        case 'start':
            return <Start player={player} error={screen.error} onInvite={createInvite} onJoin={join} />;
    }
}

function Start({
    player,
    error,
    onInvite,
    onJoin,
}: {
    player: SignedInPlayer;
    error: string | undefined;
    onInvite: () => Promise<void>;
    onJoin: (inviteId: string) => Promise<void>;
}) {
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const run = (action: () => Promise<void>) => async () => {
        setBusy(true);
        await action();
        setBusy(false);
    };

    return (
        <section class="lobby">
            <h1>{t('lobby.greeting', { name: player.username })}</h1>
            <p class="notice">{t('lobby.tagline')}</p>
            <ol class="how-to">
                <li>{t('lobby.howTo1')}</li>
                <li>{t('lobby.howTo2')}</li>
                <li>{t('lobby.howTo3')}</li>
            </ol>
            {error && (
                <p class="error" role="alert">
                    {error}
                </p>
            )}
            <button class="primary big" data-testid="invite" disabled={busy} onClick={run(onInvite)}>
                {t('lobby.invite')}
            </button>
            <form
                class="panel"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (code.trim()) {
                        void run(() => onJoin(code.trim()))();
                    }
                }}
            >
                <label>
                    {t('lobby.joinTitle')}
                    <input
                        name="invite-code"
                        data-testid="join-code"
                        value={code}
                        onInput={(e) => setCode(e.currentTarget.value)}
                        placeholder={t('lobby.joinPlaceholder')}
                        autoComplete="off"
                    />
                </label>
                <button type="submit" data-testid="join" disabled={busy || !code.trim()}>
                    {t('lobby.join')}
                </button>
            </form>
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
            <button data-testid="copy-code" onClick={() => void copy()}>
                {state === 'copied' ? t('waiting.copied') : t('waiting.copy')}
            </button>
            {state === 'failed' && <span class="notice">{t('waiting.copyBlocked')}</span>}
        </>
    );
}

function Waiting({
    inviteId,
    api,
    pollMs,
    link,
    onShare,
    onAccepted,
    onExpired,
    onCancel,
}: {
    inviteId: string;
    api: LobbyApi;
    pollMs: number;
    link: string;
    onShare: (link: string) => void;
    onAccepted: (duelId: string) => void;
    onExpired: () => void;
    onCancel: () => void;
}) {
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
        <section class="lobby">
            <h1>{t('waiting.title')}</h1>
            <p class="notice">{t('waiting.hint')}</p>
            <button class="primary big" data-testid="share-invite" onClick={() => onShare(link)}>
                {t('waiting.share')}
            </button>
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
            <button onClick={onCancel}>{t('waiting.cancel')}</button>
        </section>
    );
}
