#!/usr/bin/env node
/**
 * Synthesizes the default sound pack (public/sounds/default/*.wav) with no dependencies: short envelopes of sine
 * tones and filtered noise, written as 16-bit mono 22050 Hz WAV. Placeholders until real sounds exist; the audio
 * manager only cares about the file names.
 *
 *   npm run gen:sounds
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds', 'default');

/** Builds samples in [-1, 1] from a per-sample function over seconds. */
function render(seconds, sample) {
    const n = Math.round(seconds * RATE);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        out[i] = sample(i / RATE, i / n);
    }
    return out;
}

const env = (p, attack = 0.02, release = 0.4) => Math.min(1, p / attack) * Math.pow(1 - p, release * 4);
const sine = (t, f) => Math.sin(2 * Math.PI * f * t);
let seed = 7;
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

const SOUNDS = {
    // A card sliding onto the felt: a short brushed noise burst.
    slide: render(0.09, (t, p) => noise() * env(p, 0.01, 0.6) * 0.35),
    // A beat: a thump dropping from 220 to 110 Hz with a click on top.
    beat: render(
        0.16,
        (t, p) => (sine(t, 220 - 110 * p) * 0.7 + noise() * 0.15 * (1 - p)) * env(p, 0.005, 0.5),
    ),
    // Taking cards: a descending minor triad.
    take: render(0.24, (t, p) => {
        const f = p < 0.33 ? 392 : p < 0.66 ? 311 : 262;
        return sine(t, f) * env((p % 0.33) / 0.33, 0.02, 0.3) * 0.5;
    }),
    // Dealing: a tiny click.
    deal: render(0.07, (t, p) => noise() * env(p, 0.002, 0.9) * 0.3),
    // Your turn: a two-tone chime.
    turn: render(
        0.3,
        (t, p) =>
            (sine(t, 659) * (p < 0.5 ? 1 : 0) + sine(t, 880) * (p >= 0.5 ? 1 : 0)) *
            env(p < 0.5 ? p * 2 : (p - 0.5) * 2, 0.01, 0.35) *
            0.45,
    ),
    // Win: an ascending major arpeggio.
    win: render(0.6, (t, p) => {
        const step = Math.min(3, Math.floor(p * 4));
        const f = [523, 659, 784, 1047][step];
        return sine(t, f) * env((p * 4) % 1, 0.02, 0.3) * 0.45;
    }),
    // Lose: a falling minor third with a slow decay.
    lose: render(
        0.6,
        (t, p) =>
            (sine(t, 330) * (p < 0.5 ? 1 : 0) + sine(t, 277) * (p >= 0.5 ? 1 : 0)) *
            env(p < 0.5 ? p * 2 : (p - 0.5) * 2, 0.02, 0.2) *
            0.4,
    ),
};

function wav(samples) {
    const bytes = Buffer.alloc(44 + samples.length * 2);
    bytes.write('RIFF', 0);
    bytes.writeUInt32LE(36 + samples.length * 2, 4);
    bytes.write('WAVE', 8);
    bytes.write('fmt ', 12);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20); // PCM
    bytes.writeUInt16LE(1, 22); // mono
    bytes.writeUInt32LE(RATE, 24);
    bytes.writeUInt32LE(RATE * 2, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(samples.length * 2, 40);
    samples.forEach((value, i) =>
        bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2),
    );
    return bytes;
}

mkdirSync(OUT, { recursive: true });
for (const [name, samples] of Object.entries(SOUNDS)) {
    writeFileSync(join(OUT, `${name}.wav`), wav(samples));
}
console.log(`Wrote ${Object.keys(SOUNDS).length} sounds to ${OUT}`);
