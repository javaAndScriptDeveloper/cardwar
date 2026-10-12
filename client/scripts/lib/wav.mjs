/** Dependency-free synthesis helpers shared by the sound generators: 16-bit mono 22050 Hz WAV. */
export const RATE = 22050;

/** Builds samples in [-1, 1] from a per-sample function of (seconds, progress 0..1). */
export function render(seconds, sample) {
    const n = Math.round(seconds * RATE);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        out[i] = sample(i / RATE, i / n);
    }
    return out;
}

export const env = (p, attack = 0.02, release = 0.4) =>
    Math.min(1, p / attack) * Math.pow(1 - p, release * 4);
export const sine = (t, f) => Math.sin(2 * Math.PI * f * t);

/** A deterministic noise source, so regenerating gives byte-identical files. */
export function noiseSource(seed) {
    let state = seed;
    return () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
}

export function wav(samples) {
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
