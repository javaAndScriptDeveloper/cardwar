import type { Telegram } from '../telegram/webapp';

export function App({ telegram }: { telegram: Telegram }) {
    return (
        <main class="app">
            <h1>Cardwar</h1>
            {telegram.inTelegram ? null : <p class="notice">Running outside Telegram: dev shim.</p>}
        </main>
    );
}
