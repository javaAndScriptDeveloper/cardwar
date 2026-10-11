import { render } from 'preact';
import { resolveTelegram, type TelegramHost } from './telegram/webapp';
import { App } from './ui/App';
import './ui/styles.css';

const telegram = resolveTelegram(window as unknown as TelegramHost);
telegram.ready();

const root = document.getElementById('app');
if (root) {
    render(<App telegram={telegram} />, root);
}
