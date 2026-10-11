import { render } from 'preact';
import { ApiClient } from './api/client';
import { Session } from './auth/session';
import { resolveTelegram, type TelegramHost } from './telegram/webapp';
import { App } from './ui/App';
import './ui/styles.css';

const telegram = resolveTelegram(window as unknown as TelegramHost);
telegram.ready();

const session = new Session();
const api = new ApiClient(
    (input, init) => fetch(input, init),
    () => session.token(),
);

const root = document.getElementById('app');
if (root) {
    render(
        <App
            telegram={telegram}
            api={api}
            session={session}
            home={(player) => <p class="notice">Signed in as {player.username}.</p>}
        />,
        root,
    );
}
