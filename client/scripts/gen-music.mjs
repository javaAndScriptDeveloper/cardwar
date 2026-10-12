#!/usr/bin/env node
/**
 * Synthesizes the placeholder background loop (public/sounds/default/theme.wav) with no dependencies: a soft pad
 * and a plucked arpeggio over Am - F - C - G, four seconds a chord, sixteen seconds in all. Every note fades in and
 * out inside its own slot, so the end meets the start and the loop has no click. Replace the file with real music
 * at will; the audio manager only cares about the name.
 *
 *   npm run gen:music
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, sine, wav } from './lib/wav.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds', 'default', 'theme.wav');
const CHORD_SECONDS = 4;
const NOTE_SECONDS = 0.25;
// Root position triads, Hz: A minor, F major, C major, G major.
const CHORDS = [
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 261.63, 329.63],
    [196.0, 246.94, 293.66],
];
const ARPEGGIO = [0, 1, 2, 1];

const samples = render(CHORDS.length * CHORD_SECONDS, (t) => {
    const chord = CHORDS[Math.floor(t / CHORD_SECONDS) % CHORDS.length];
    const inChord = (t % CHORD_SECONDS) / CHORD_SECONDS;
    const swell = Math.sin(Math.PI * inChord);
    const pad = chord.reduce((sum, f) => sum + sine(t, f / 2), 0) / chord.length;
    const step = Math.floor(t / NOTE_SECONDS);
    const inNote = (t % NOTE_SECONDS) / NOTE_SECONDS;
    const pluck =
        sine(t, chord[ARPEGGIO[step % ARPEGGIO.length]] * 2) * Math.min(1, inNote * 50) * (1 - inNote) ** 3;
    return pad * swell * 0.18 + pluck * 0.12;
});

writeFileSync(OUT, wav(samples));
console.log(`Wrote ${OUT}`);
