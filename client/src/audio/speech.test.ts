import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, settings } from '../state/settings';
import { Speech } from './speech';

/** jsdom has no speech API; this is the shape the runtime touches. */
class FakeUtterance {
    voice: SpeechSynthesisVoice | null = null;
    lang = '';
    rate = 1;
    pitch = 1;
    constructor(public text: string) {}
}

const voice = (lang: string, name = lang): SpeechSynthesisVoice =>
    ({ lang, name, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

function fakeSynth(voices: SpeechSynthesisVoice[]) {
    const calls: string[] = [];
    const spoken: FakeUtterance[] = [];
    const synth = {
        speaking: false,
        pending: false,
        getVoices: () => voices,
        speak: vi.fn((utterance: FakeUtterance) => {
            calls.push('speak');
            spoken.push(utterance);
            synth.speaking = true;
        }),
        cancel: vi.fn(() => {
            calls.push('cancel');
            synth.speaking = false;
        }),
    };
    return { synth: synth as unknown as SpeechSynthesis, calls, spoken };
}

describe('Speech', () => {
    let now = 0;
    beforeEach(() => {
        now = 0;
        settings.value = DEFAULT_SETTINGS;
        vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const make = (fake: ReturnType<typeof fakeSynth> | undefined) =>
        new Speech({ synth: () => fake?.synth, now: () => now });

    it('speaks with the Ukrainian voice when the device has one', () => {
        const fake = fakeSynth([voice('en-US'), voice('uk-UA', 'Lesya'), voice('ru-RU')]);
        const speech = make(fake);

        expect(speech.say('Мінус гроші')).toBe(true);

        expect(fake.spoken).toHaveLength(1);
        expect(fake.spoken[0]?.text).toBe('Мінус гроші');
        expect(fake.spoken[0]?.voice?.name).toBe('Lesya');
        expect(fake.spoken[0]?.lang).toBe('uk-UA');
    });

    it('falls back to the default voice tagged uk-UA when no Ukrainian voice is installed', () => {
        const fake = fakeSynth([voice('en-US')]);

        expect(make(fake).say('Йоу')).toBe(true);

        expect(fake.spoken[0]?.voice).toBeNull();
        expect(fake.spoken[0]?.lang).toBe('uk-UA');
    });

    it('applies rate and pitch to the utterance', () => {
        const fake = fakeSynth([]);

        make(fake).say('Йоу', { rate: 1.4, pitch: 0.6 });

        expect(fake.spoken[0]).toMatchObject({ rate: 1.4, pitch: 0.6 });
    });

    it('says nothing while sound is off', () => {
        settings.value = { ...DEFAULT_SETTINGS, sound: false };
        const fake = fakeSynth([voice('uk-UA')]);

        expect(make(fake).say('Йоу')).toBe(false);

        expect(fake.synth.speak).not.toHaveBeenCalled();
    });

    it('says nothing on a device without speech synthesis', () => {
        expect(make(undefined).say('Йоу')).toBe(false);
    });

    it('de-dupes the same line within 150 ms, per line', () => {
        const fake = fakeSynth([voice('uk-UA')]);
        const speech = make(fake);

        expect(speech.say('Йоу')).toBe(true);
        now = 100;
        expect(speech.say('Йоу')).toBe(false);
        expect(speech.say('Терміново')).toBe(true);
        now = 400;
        expect(speech.say('Йоу')).toBe(true);

        expect(fake.spoken.map((u) => u.text)).toEqual(['Йоу', 'Терміново', 'Йоу']);
    });

    it('cancels the line still speaking before starting the next', () => {
        const fake = fakeSynth([voice('uk-UA')]);
        const speech = make(fake);

        speech.say('Перша');
        now = 1000;
        speech.say('Друга');

        expect(fake.calls).toEqual(['speak', 'cancel', 'speak']);
    });

    it('treats a synthesizer that throws as silent', () => {
        const fake = fakeSynth([voice('uk-UA')]);
        (fake.synth.speak as unknown as { mockImplementation: (f: () => void) => void }).mockImplementation(
            () => {
                throw new Error('not allowed');
            },
        );

        expect(make(fake).say('Йоу')).toBe(false);
    });
});
