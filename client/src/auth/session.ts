import { ApiError, type ApiClient } from '../api/client';
import type { AuthResponse } from '../api/types';
import type { Telegram } from '../telegram/webapp';

type AuthApi = Pick<ApiClient, 'telegramSignIn' | 'passwordLogin' | 'register'>;

export interface SignedInPlayer {
    playerId: string;
    username: string;
    /** What to call the player on screen; the Telegram name when known, else the username. */
    displayName?: string;
    photoUrl?: string;
}

/**
 * Who we are and the bearer token proving it. Memory only, never localStorage: a Mini App is reopened often and
 * re-signing with fresh initData is cheap, while a token left in storage outlives the Telegram session it came from.
 */
export class Session {
    private current: AuthResponse | undefined;

    token(): string | undefined {
        return this.current?.token;
    }

    player(): SignedInPlayer | undefined {
        return this.current
            ? { playerId: this.current.playerId, username: this.current.username }
            : undefined;
    }

    async signInWithTelegram(api: AuthApi, telegram: Telegram): Promise<SignedInPlayer> {
        if (!telegram.inTelegram) {
            throw new Error('Not running inside Telegram');
        }
        return this.adopt(await api.telegramSignIn(telegram.initData));
    }

    /**
     * The browser dev shim: password login, registering the name on first use. Any new name works in a fresh browser
     * context, which is what the end-to-end test relies on.
     */
    async signInDev(api: AuthApi, username: string, password: string): Promise<SignedInPlayer> {
        try {
            return this.adopt(await api.passwordLogin(username, password));
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                return this.adopt(await api.register(username, password));
            }
            throw error;
        }
    }

    private adopt(response: AuthResponse): SignedInPlayer {
        this.current = response;
        return { playerId: response.playerId, username: response.username };
    }
}
