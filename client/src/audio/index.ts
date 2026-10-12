import { settings } from '../state/settings';

export type Channel = 'sfx' | 'voice' | 'music';
export type DefaultSound = 'slide' | 'beat' | 'take' | 'deal' | 'turn' | 'win' | 'lose';

/** A flurry of events must not stack the same sound on itself. */
const DEDUPE_MS = 150;
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'] as const;

interface Entry {
    url: string;
    channel: Channel;
    buffer?: AudioBuffer;
    loading?: Promise<void>;
}

interface Deps {
    context?: () => AudioContext | undefined;
    fetchImpl?: typeof fetch;
    now?: () => number;
}

/**
 * One AudioContext for the whole app. Browsers refuse to start audio before a user gesture, so nothing plays
 * until `installUnlock` has seen one; every call before that, or on a device without Web Audio, is a quiet no-op.
 * Sounds are fetched and decoded lazily, once.
 */
export class AudioManager {
    private ctx: AudioContext | undefined;
    private readonly entries = new Map<string, Entry>();
    private readonly gains = new Map<Channel, GainNode>();
    private readonly lastPlayed = new Map<string, number>();
    private readonly makeContext: () => AudioContext | undefined;
    private readonly fetchImpl: typeof fetch;
    private readonly now: () => number;
    unlocked = false;

    constructor(deps: Deps = {}) {
        this.makeContext = deps.context ?? defaultContext;
        this.fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
        this.now = deps.now ?? (() => performance.now());
    }

    /**
     * Resumes the context on the first gesture browsers accept as activation: on touch screens that is the end of
     * the touch or the click, not pointerdown. The listeners stay installed, because iOS suspends the context again
     * when the app is backgrounded and only a gesture may resume it.
     */
    installUnlock(target: EventTarget): void {
        const unlock = () => {
            this.ctx ??= this.makeContext();
            if (!this.ctx || this.ctx.state === 'running') {
                return;
            }
            void this.ctx
                .resume()
                .then(() => {
                    this.unlocked = true;
                })
                .catch(() => {});
        };
        for (const type of UNLOCK_EVENTS) {
            target.addEventListener(type, unlock, { passive: true });
        }
    }

    register(name: string, url: string, channel: Channel = 'sfx'): void {
        this.entries.set(name, { url, channel });
    }

    play(name: string): void {
        const entry = this.entries.get(name);
        if (!entry || !this.unlocked || !this.ctx || !this.enabled(entry.channel)) {
            return;
        }
        const at = this.now();
        if (at - (this.lastPlayed.get(name) ?? Number.NEGATIVE_INFINITY) < DEDUPE_MS) {
            return;
        }
        this.lastPlayed.set(name, at);
        const ctx = this.ctx;
        // The platform may have suspended the context again (iOS does after backgrounding); a play that follows a
        // gesture is allowed to resume it.
        const ready = ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => {});
        void Promise.all([ready, this.load(entry, ctx)]).then(() => {
            if (!entry.buffer || ctx.state !== 'running') {
                return;
            }
            const source = ctx.createBufferSource();
            source.buffer = entry.buffer;
            source.connect(this.gain(entry.channel, ctx));
            source.start();
        });
    }

    private enabled(channel: Channel): boolean {
        return channel === 'music' ? settings.value.music : settings.value.sound;
    }

    private gain(channel: Channel, ctx: AudioContext): GainNode {
        let node = this.gains.get(channel);
        if (!node) {
            node = ctx.createGain();
            node.connect(ctx.destination);
            this.gains.set(channel, node);
        }
        return node;
    }

    private load(entry: Entry, ctx: AudioContext): Promise<void> {
        if (entry.buffer) {
            return Promise.resolve();
        }
        entry.loading ??= this.fetchImpl(entry.url)
            .then((response) => response.arrayBuffer())
            .then((bytes) => ctx.decodeAudioData(bytes))
            .then((buffer) => {
                entry.buffer = buffer;
            })
            .catch(() => {
                // A missing or undecodable sound is not worth a toast; the game is silent for that effect.
            });
        return entry.loading;
    }
}

function defaultContext(): AudioContext | undefined {
    const host = window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = host.AudioContext ?? host.webkitAudioContext;
    return Ctor ? new Ctor() : undefined;
}

export const DEFAULT_SOUNDS: readonly DefaultSound[] = [
    'slide',
    'beat',
    'take',
    'deal',
    'turn',
    'win',
    'lose',
];

/** The app-wide manager with the default pack registered; content packs register their own names later. */
export const audio = new AudioManager();
for (const name of DEFAULT_SOUNDS) {
    audio.register(name, `${import.meta.env.BASE_URL}sounds/default/${name}.wav`);
}
