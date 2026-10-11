import { render } from 'preact';
import { ApiClient } from './api/client';
import { Session } from './auth/session';
import { linkConfigFromEnv } from './telegram/links';
import { resolveTelegram, type TelegramHost } from './telegram/webapp';
import { App } from './ui/App';
import { Home } from './ui/Home';
import './ui/styles.css';

const telegram = resolveTelegram(window as unknown as TelegramHost);
telegram.ready();

const session = new Session();
const api = new ApiClient(
    (input, init) => fetch(input, init),
    () => session.token(),
);
// Telegram hands the invite over as start_param; the browser dev shim uses ?invite= in the URL instead.
const invite = telegram.startParam ?? new URLSearchParams(window.location.search).get('invite') ?? undefined;
const links = linkConfigFromEnv(window.location.origin);

const root = document.getElementById('app');
if (root) {
    render(
        <App
            telegram={telegram}
            api={api}
            session={session}
            home={(player) => (
                <Home
                    player={player}
                    api={api}
                    telegram={telegram}
                    invite={invite}
                    links={links}
                    table={(duelId) => <p class="notice">Duel {duelId}</p>}
                />
            )}
        />,
        root,
    );
}
