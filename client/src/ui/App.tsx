import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ApiClient } from '../api/client';
import type { SignedInPlayer, Session } from '../auth/session';
import type { Telegram } from '../telegram/webapp';
import { DevLogin } from './DevLogin';
import { describeError } from './errors';

type AuthApi = Pick<ApiClient, 'telegramSignIn' | 'passwordLogin' | 'register'>;

interface Props {
    telegram: Telegram;
    api: AuthApi;
    session: Session;
    /** What to show once signed in: the lobby and table in the real app, a stub in tests. */
    home: (player: SignedInPlayer) => ComponentChildren;
}

type State =
    | { kind: 'signing-in' }
    | { kind: 'login' }
    | { kind: 'failed'; message: string }
    | { kind: 'ready'; player: SignedInPlayer };

/** Signs in first (Telegram initData, or the dev shim's form in a plain browser), then hands over to `home`. */
export function App({ telegram, api, session, home }: Props) {
    const [state, setState] = useState<State>(
        telegram.inTelegram ? { kind: 'signing-in' } : { kind: 'login' },
    );

    useEffect(() => {
        if (!telegram.inTelegram) {
            return;
        }
        session
            .signInWithTelegram(api, telegram)
            .then((player) => setState({ kind: 'ready', player }))
            .catch((error: unknown) =>
                setState({
                    kind: 'failed',
                    message: `Could not sign in with Telegram: ${describeError(error)}`,
                }),
            );
    }, [telegram, api, session]);

    return (
        <main class="app">
            {state.kind === 'ready' ? (
                home(state.player)
            ) : (
                <>
                    <h1>Cardwar</h1>
                    {state.kind === 'signing-in' && <p class="notice">Signing in…</p>}
                    {state.kind === 'failed' && (
                        <p class="error" role="alert">
                            {state.message}. Close the app and open it again from the bot.
                        </p>
                    )}
                    {state.kind === 'login' && (
                        <DevLogin
                            onSubmit={async (username, password) => {
                                const player = await session.signInDev(api, username, password);
                                setState({ kind: 'ready', player });
                            }}
                        />
                    )}
                </>
            )}
        </main>
    );
}
