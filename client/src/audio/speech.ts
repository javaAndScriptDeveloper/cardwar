import { settings } from '../state/settings';

/** A flurry of events must not read the same line twice; same window as sounds. */
const DEDUPE_MS = 150;
const LANG = 'uk-UA';

interface Deps {
    /** Looked up per call: some webviews attach the API after the page script has started. */
    synth?: () => SpeechSynthesis | undefined;
    now?: () => number;
}

export interface SayOptions {
    rate?: number;
    pitch?: number;
}

/**
 * Reads pack lines with the device's own voice (no recordings are shipped). Prefers a Ukrainian voice and tags the
 * utterance `uk-UA` either way, so a device without one still pronounces Cyrillic rather than spelling it. Obeys
 * the sound setting; a line still speaking is cut off by the next, so two rules firing together never overlap.
 * Returns whether anything was spoken so the caller can show the line instead.
 */
export class Speech {
    private readonly synth: () => SpeechSynthesis | undefined;
    private readonly now: () => number;
    private readonly lastSaid = new Map<string, number>();

    constructor(deps: Deps = {}) {
        this.synth = deps.synth ?? defaultSynth;
        this.now = deps.now ?? (() => performance.now());
    }

    say(text: string, options: SayOptions = {}): boolean {
        const synth = this.synth();
        if (!synth || !settings.value.sound || typeof SpeechSynthesisUtterance === 'undefined') {
            return false;
        }
        const at = this.now();
        if (at - (this.lastSaid.get(text) ?? Number.NEGATIVE_INFINITY) < DEDUPE_MS) {
            return false;
        }
        this.lastSaid.set(text, at);
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = LANG;
            const voice = synth
                .getVoices()
                .find((candidate) => candidate.lang.toLowerCase().startsWith('uk'));
            if (voice) {
                utterance.voice = voice;
            }
            if (options.rate !== undefined) {
                utterance.rate = options.rate;
            }
            if (options.pitch !== undefined) {
                utterance.pitch = options.pitch;
            }
            if (synth.speaking || synth.pending) {
                synth.cancel();
            }
            synth.speak(utterance);
            return true;
        } catch {
            // A webview may expose the API and still refuse to speak; the line is shown instead.
            return false;
        }
    }
}

function defaultSynth(): SpeechSynthesis | undefined {
    try {
        return typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis;
    } catch {
        return undefined;
    }
}

/** The app-wide voice; the pack runtime reads `say` effects through it. */
export const speech = new Speech();
