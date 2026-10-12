import { useState } from 'preact/hooks';
import { describeError } from './errors';

/**
 * The browser dev shim: Telegram is absent, so sign in with a password instead. An unknown name is registered on
 * the spot. Never shown inside Telegram.
 */
export function DevLogin({ onSubmit }: { onSubmit: (username: string, password: string) => Promise<void> }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);

    const submit = async (event: Event) => {
        event.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
            await onSubmit(username.trim(), password);
        } catch (failure) {
            setError(describeError(failure));
            setBusy(false);
        }
    };

    return (
        <form class="panel" onSubmit={submit}>
            <p class="notice">
                Running outside Telegram: dev shim. Sign in with any name; new names are registered.
            </p>
            <label>
                Username
                <input
                    name="username"
                    data-testid="dev-username"
                    autoComplete="username"
                    value={username}
                    onInput={(e) => setUsername(e.currentTarget.value)}
                    required
                    minLength={3}
                />
            </label>
            <label>
                Password
                <input
                    name="password"
                    data-testid="dev-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onInput={(e) => setPassword(e.currentTarget.value)}
                    required
                    minLength={10}
                />
            </label>
            {error && (
                <p class="error" role="alert">
                    {error}
                </p>
            )}
            <button type="submit" class="primary" data-testid="dev-sign-in" disabled={busy}>
                Sign in
            </button>
        </form>
    );
}
