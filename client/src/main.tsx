import { computed, effect } from '@preact/signals';
import { render } from 'preact';
import { ApiClient } from './api/client';
import { openDuelStream } from './api/events';
import { Session } from './auth/session';
import { linkConfigFromEnv } from './telegram/links';
import { resolveTelegram, type TelegramHost } from './telegram/webapp';
import { audio, THEME } from './audio';
import { equip, PackLoader } from './content/loader';
import { trackStreams, watchBrowser } from './state/connection';
import { loadSettings, settings } from './state/settings';
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
audio.setMusic(THEME);
// The equipped deck loads lazily, and again only when the player picks another one.
const packs = new PackLoader();
const deck = computed(() => settings.value.deck);
effect(() => {
    void equip(deck.value, { loader: packs, audio });
});

const session = new Session();
const api = new ApiClient(
    (input, init) => fetch(input, init),
    () => session.token(),
);
// A named-app link hands the invite over as start_param; the bot's Join button and the dev shim use ?invite=.
const invite = telegram.startParam ?? new URLSearchParams(window.location.search).get('invite') ?? undefined;
const links = linkConfigFromEnv(window.location.origin);
// The no-connection banner listens to the browser, every API request and every duel stream.
watchBrowser(window, navigator.onLine);
const openStream: StreamOpener = trackStreams((duelId, options) =>
    openDuelStream(duelId, {
        ...options,
        fetchImpl: (input, init) => fetch(input, init),
        headers: () => api.authHeaders(),
    }),
);

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
                            player={player}
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
