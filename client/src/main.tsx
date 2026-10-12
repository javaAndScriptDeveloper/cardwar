import { render } from 'preact';
import { ApiClient } from './api/client';
import { openDuelStream } from './api/events';
import { Session } from './auth/session';
import { linkConfigFromEnv } from './telegram/links';
import { resolveTelegram, type TelegramHost } from './telegram/webapp';
import { audio } from './audio';
import { loadSettings } from './state/settings';
import { App } from './ui/App';
import { DuelScreen, type StreamOpener } from './ui/DuelScreen';
import { Shell } from './ui/Shell';
import './ui/styles.css';

const telegram = resolveTelegram(window as unknown as TelegramHost);
telegram.ready();
document.documentElement.dataset['scheme'] = telegram.colorScheme;
loadSettings();
// Browsers allow audio only after a gesture; the first tap anywhere unlocks it.
audio.installUnlock(document);

const session = new Session();
const api = new ApiClient(
    (input, init) => fetch(input, init),
    () => session.token(),
);
// A named-app link hands the invite over as start_param; the bot's Join button and the dev shim use ?invite=.
const invite = telegram.startParam ?? new URLSearchParams(window.location.search).get('invite') ?? undefined;
const links = linkConfigFromEnv(window.location.origin);
const openStream: StreamOpener = (duelId, options) =>
    openDuelStream(duelId, {
        ...options,
        fetchImpl: (input, init) => fetch(input, init),
        headers: () => api.authHeaders(),
    });

const root = document.getElementById('app');
if (root) {
    render(
        <App
            telegram={telegram}
            api={api}
            session={session}
            home={(player) => (
                <Shell
                    player={{
                        ...player,
                        displayName: telegram.user
                            ? [telegram.user.firstName, telegram.user.lastName].filter(Boolean).join(' ')
                            : player.username,
                        ...(telegram.user?.photoUrl !== undefined && { photoUrl: telegram.user.photoUrl }),
                    }}
                    api={api}
                    telegram={telegram}
                    invite={invite}
                    links={links}
                    table={(duelId, exit) => (
                        <DuelScreen
                            key={duelId}
                            duelId={duelId}
                            api={api}
                            telegram={telegram}
                            openStream={openStream}
                            onExit={exit}
                        />
                    )}
                />
            )}
        />,
        root,
    );
}
